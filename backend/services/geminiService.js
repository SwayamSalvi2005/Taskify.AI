import Task from "../models/taskModel.js";
import User from "../models/userModel.js";
// get all task related services
import {
    createTaskService,
    updateTaskService,
    deleteTaskService,
    findTaskByTitleService
} from "./taskService.js";

// rate limiter for gemini API// create hashmap
const userRequestCount = new Map();

// clean userRequest in every 60 min
setInterval(() => {
    userRequestCount.clear();
}, 60 * 60 * 1000);

// tools = these are the actions we let gemin perform on users behalf
// gemini decide on its own which action based message
// based on the name + description we give it below.
const taskTools = [
    {
        functionDeclarations: [
            {   
                // fucntion name
                name: "create_task",
                // what it does
                description: "Create a brand new task for the user. Use this only when the user clearly asks to add/create/remind them about something new.",
                // what parameters it need
                parameters: {
                    type: "object",
                    properties: {
                        title: { type: "string", description: "Short, clear title for the task" },
                        description: { type: "string", description: "Optional extra detail about the task" },
                        priority: { type: "string", enum: ["Low", "Medium", "High"], description: "Defaults to Medium if the user does not say a priority" },
                        dueDate: { type: "string", description: "Due date in YYYY-MM-DD format. If the user doesn't give one, default to 7 days from today's date." }
                    },
                    required: ["title", "dueDate"]
                }
            },
            {
                name: "update_task",
                description: "Update an existing task — rename it, change its description/priority/due date, or mark it complete/incomplete. Identify the task using its CURRENT title exactly as it appears in the task list given to you, or as discussed earlier in this conversation.",
                parameters: {
                    type: "object",
                    properties: {
                        title: { type: "string", description: "The task's current title, exactly as listed" },
                        newTitle: { type: "string", description: "Only set this if the user wants to rename the task" },
                        description: { type: "string" },
                        priority: { type: "string", enum: ["Low", "Medium", "High"] },
                        dueDate: { type: "string", description: "New due date in YYYY-MM-DD format" },
                        completed: { type: "boolean", description: "true = mark task done, false = mark task not done" }
                    },
                    required: ["title"]
                }
            },
            {
                name: "delete_task",
                description: "Permanently delete a task. Identify the task using its title exactly as it appears in the task list given to you, or as discussed earlier in this conversation.",
                parameters: {
                    type: "object",
                    properties: {
                        title: { type: "string", description: "Exact title of the task to delete" }
                    },
                    required: ["title"]
                }
            }
        ]
    }
];



// Actually performs the database change Gemini asked for, reusing the exact same service functions the normal CRUD routes use
// (so validation + Redis cache invalidation stay identical no matter who triggers the change).

const runTaskFunction = async (userId, functionCall) => {
    const { name, args = {} } = functionCall;
    // gemini provide the values automatically to args, if not exits then args ={} defalt

    try {
        // use the create task service
        if (name === "create_task") {
            const task = await createTaskService({
                title: args.title,
                description: args.description || '',
                priority: args.priority || 'Medium',
                dueDate: args.dueDate
            }, userId);

            return { success: true, action: 'created', task: { title: task.title, priority: task.priority, dueDate: task.dueDate } };
        }

        if (name === "update_task") {
            // find if task by this title exists or not
            const existing = await findTaskByTitleService(userId, args.title);

            // if task not exists say 
            if (!existing) {
                return { success: false, message: `I couldn't find a task called "${args.title}".` };
            }

            // get all data field and append it to body object
            const body = {}; 
            if (args.newTitle !== undefined) body.title = args.newTitle;
            if (args.description !== undefined) body.description = args.description;
            if (args.priority !== undefined) body.priority = args.priority;
            if (args.dueDate !== undefined) body.dueDate = args.dueDate;
            if (args.completed !== undefined) body.completed = args.completed;

            // update the task using update service
            const updated = await updateTaskService(existing._id, body, userId);
            return { success: true, action: 'updated', task: { title: updated.title, completed: updated.completed, priority: updated.priority } };
        }

        if (name === "delete_task") {
            // find if task by this title exists or not
            const existing = await findTaskByTitleService(userId, args.title);

             // if task not exists say 
            if (!existing) {
                return { success: false, message: `I couldn't find a task called "${args.title}".` };
            }

            // delete the task using delete service
            await deleteTaskService(existing._id, userId);
            return { success: true, action: 'deleted', task: { title: existing.title } };
        }

        return { success: false, message: `Unknown action: ${name}` };
    } catch (error) {
        return { success: false, message: error.message };
    }
};


// history items look like: { role: 'user' | 'model', text: '...' }
export const chatWithGeminiService = async (userId, message, allowActions = true, history = []) => {
    try {
        // get api key form env
        const API_KEY = process.env.GEMINI_API_KEY;

        // if key not exits in .env throw error
        if (!API_KEY) {
            throw new Error('Gemini API key does not exist in .env');
        }

        // gets the gemini model name
        let modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
        if (modelName.startsWith('models/')) {
            modelName = modelName.replace('models/', '');
        }

        // construct the api url with the gemini key and model name
        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

        // cover user id to string
        const userIDStr = userId.toString();
        // if user exists return their request count, else return 0
        const userRequests = userRequestCount.get(userIDStr) || 0;

        // throw erorr is user has made more rquest than 10
        if (userRequests >= 10) {
            throw new Error('Rate limit exceeded. You can only make 10 requests per hour');
        }

        // if not more then 10 Adds 1 to the user's request count
        userRequestCount.set(userIDStr, userRequests + 1);


        // find both the user and the tasks al the same time
        const [tasks, user] = await Promise.all([
            Task.find({ owner: userId }).lean(),
            User.findById(userId).lean()
        ]);


        // description inclusion decider
        // check if the title contains generic keywords
        const isTitleGeneric = (title) => {
            const keywords = ['tasks', 'stuff', 'work', 'misc', 'list'];
            return keywords.some(word => title.toLowerCase().includes(word));
        };
        // check if the users message ask for detailed info
        const needsDetail = (msg) => {
            const m = msg.toLowerCase();
            return m.includes('explain') || m.includes('what') || m.includes('detail');
        };
        // so is above condition ( tilte genric, needs info) are true then include descriotiop to task, esle not
        const formatTask = (t) => {
            if ((isTitleGeneric(t.title) || needsDetail(message)) && t.description) {
                return `  - ${t.title}: ${t.description}`;
            }
            return `  - ${t.title}`;
        };



        // get only completed tasks 
        const completedTasks = tasks.filter(t => t.completed === true);
        // get only pending tasks 
        const pendingTasks = tasks.filter(t => t.completed === false);
         
        // get only jigh priority pending tasks 
        const highPriorityPending = pendingTasks.filter(t => t.priority === 'High');
        // get only medium priority pending tasks 
        const mediumPriorityPending = pendingTasks.filter(t => t.priority === 'Medium');
        // get only low priority pending tasks 
        const lowPriorityPending = pendingTasks.filter(t => t.priority === 'Low');

        // get only high priority completed tasks 
        const highPriorityCompleted = completedTasks.filter(t => t.priority === 'High');
        // get only medium priority completed tasks 
        const mediumPriorityCompleted = completedTasks.filter(t => t.priority === 'Medium');
        // get only low priority completed tasks 
        const lowPriorityCompleted = completedTasks.filter(t => t.priority === 'Low');


        // convert the messy list of database records into cleran report that AI UNDERSTAND
        const highPriorityCompletedDetails = highPriorityCompleted.map(t =>
            `${formatTask(t)} (Completed: ${new Date(t.updatedAt).toLocaleDateString()})`
        ).join('\n');

        const mediumPriorityCompletedDetails = mediumPriorityCompleted.map(t =>
            `${formatTask(t)} (Completed: ${new Date(t.updatedAt).toLocaleDateString()})`
        ).join('\n');

        const lowPriorityCompletedDetails = lowPriorityCompleted.map(t =>
            `${formatTask(t)} (Completed: ${new Date(t.updatedAt).toLocaleDateString()})`
        ).join('\n');

        const highPriorityPendingDetails = highPriorityPending.map(t =>
            `${formatTask(t)}${t.dueDate ? ` (Due: ${new Date(t.dueDate).toLocaleDateString()})` : ''}`
        ).join('\n');

        const mediumPriorityPendingDetails = mediumPriorityPending.map(t =>
            `${formatTask(t)}${t.dueDate ? ` (Due: ${new Date(t.dueDate).toLocaleDateString()})` : ''}`
        ).join('\n');

        const lowPriorityPendingDetails = lowPriorityPending.map(t =>
            `${formatTask(t)}${t.dueDate ? ` (Due: ${new Date(t.dueDate).toLocaleDateString()})` : ''}`
        ).join('\n');


        // todays date
        const today = new Date().toISOString().split('T')[0];





        const profileBlock = `
    ..USER PROFILE..
    - Name: ${user?.name || 'Unknown'}
    - Email: ${user?.email || 'Unknown'}
    - Member since: ${user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Unknown'}`;

        const actionInstructions = allowActions
            ? `You can directly create, update, delete, or complete the user's tasks by calling the create_task, update_task, or delete_task functions. Only call a function when the user clearly asks you to add/change/remove/complete a task — for everything else just reply normally in text. When updating or deleting, match the task using its title exactly as it appears below (or as discussed earlier in this conversation). If the user asks to create a task without giving a due date, default the due date to 7 days from today (${today}).`
            : `Do not call any functions — just answer in plain text.`;


        // system instrcution - send once per request
        // this contains all the informatin like who the user is, tasks, todays date, ow tow ai should behave etc 
        const systemInstructionText = `You are a helpful task management assistant. Today's date is ${today}.
${profileBlock}

${actionInstructions}

    ..TASK SUMMARY..
    - Total tasks: ${tasks.length}
    - Completed: ${completedTasks.length}
    - Pending: ${pendingTasks.length}


    ..COMPLETED TASKS BREAKDOWN..

    **High Priority Completed (${highPriorityCompleted.length}):**
    ${highPriorityCompletedDetails || '  None'}

    **Medium Priority Completed (${mediumPriorityCompleted.length}):**
    ${mediumPriorityCompletedDetails || '  None'}

    **Low Priority Completed (${lowPriorityCompleted.length}):**
    ${lowPriorityCompletedDetails || '  None'}



    ..PENDING TASKS BY PRIORITY..

    **High Priority Tasks (${highPriorityPending.length}):**
    ${highPriorityPendingDetails || '  None'}

    **Medium Priority Tasks (${mediumPriorityPending.length}):**
    ${mediumPriorityPendingDetails || '  None'}

    **Low Priority Tasks (${lowPriorityPending.length}):**
    ${lowPriorityPendingDetails || '  None'}


    **ALL PENDING TASKS DETAILS:**
    ${pendingTasks.map(t => `${formatTask(t)} (Priority: ${t.priority}, Due: ${t.dueDate ? new Date(t.dueDate).toLocaleDateString() : 'No due date'})`).join('\n') || 'No pending tasks'}

Please provide a helpful, friendly response based on this complete profile and task data. Be specific and reference actual task names when relevant. Use emojis to make it engaging.`;

        // CONTENTS — the actual conversation: earlier turns (capped to the
        // last 10, enforced again here even though the controller already
        // trims it) followed by the user's new message. ───
        // take only 10 message from the histroy array and map/ covert it ot gemin format
        const historyContents = history.slice(-10).map(h => ({
            role: h.role === 'model' ? 'model' : 'user',
            parts: [{ text: h.text }]
        }));

        // it combines the history content and the curretn message
        const contents = [
            ...historyContents,
            { role: 'user', parts: [{ text: message }] }
        ];

        // create the reqest body to send to the gemini api
        // consists of the instrction message, contents and aloowed actions
        const requestBody = {
            systemInstruction: { parts: [{ text: systemInstructionText }] },
            contents,
            ...(allowActions ? { tools: taskTools } : {})
        };

        // the request we are sending to gemini api
        const response = await fetch(`${API_URL}?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        // the data we are recevinvg from gemini
        const data = await response.json();

        // of tjhe response is not okay thorw error 
        if (!response.ok) {
            console.error('API Error Response:', JSON.stringify(data, null, 2));
            throw new Error(data.error?.message || 'API call failed');
        }

        const parts = data.candidates?.[0]?.content?.parts || [];
        const functionCallPart = parts.find(p => p.functionCall);

        // ── Gemini wants to perform a task action ──────────────────────────
        if (functionCallPart) {
            const functionResult = await runTaskFunction(userId, functionCallPart.functionCall);

            // Send the result back so Gemini can phrase a normal reply about it
            const followUpBody = {
                systemInstruction: { parts: [{ text: systemInstructionText }] },
                contents: [
                    ...contents,
                    { role: 'model', parts: [{ functionCall: functionCallPart.functionCall }] },
                    { role: 'user', parts: [{ functionResponse: { name: functionCallPart.functionCall.name, response: functionResult } }] }
                ],
                tools: taskTools
            };

            const followUpResponse = await fetch(`${API_URL}?key=${API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(followUpBody)
            });

            const followUpData = await followUpResponse.json();

            if (!followUpResponse.ok) {
                console.error('API Error Response (follow-up):', JSON.stringify(followUpData, null, 2));
                throw new Error(followUpData.error?.message || 'API call failed');
            }

            const finalText = followUpData.candidates?.[0]?.content?.parts?.find(p => p.text)?.text
                || (functionResult.success
                    ? `Done! I've ${functionResult.action} the task "${functionResult.task?.title}". ✅`
                    : `⚠️ ${functionResult.message}`);

            return { text: finalText, taskActionPerformed: functionResult.success === true };
        }

       
        const aiResponse = parts.find(p => p.text)?.text;

        if (!aiResponse) {
            throw new Error('No response text in API response');
        }

        return { text: aiResponse, taskActionPerformed: false };

    } catch (error) {
        console.error('Gemini API Error:', error);
        throw new Error(`Failed to get AI response: ${error.message}`);
    }
};