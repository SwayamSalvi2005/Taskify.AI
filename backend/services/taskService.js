import Task from '../models/taskModel.js';

// get all helper fuction for redis
import { getCache, setCache, deleteCachePattern } from '../config/redis.js';

// fuction to skip all special charactes
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// cache TTL constants
const STATS_TTL   = 60;   // task stats expire after 60 seconds
const SUMMARY_TTL = 300;  // AI summary expires after 5 minutes

// cache key generators 
const statsKey   = (userId) => `stats:${userId}`;
const summaryKey = (userId) => `summary:${userId}`;

// fucntion to invalidate user cache
// called whenever task are changes, like create update delete(then stats and summmary change hence delete)
const invalidateUserCache = async (userId) => {
    await deleteCachePattern(statsKey(userId));
    await deleteCachePattern(summaryKey(userId));
};


//CREATE TASK SERVICE
export const createTaskService = async (data, userId) => {
    // credentials
    const { title, description, priority, dueDate } = data;

    // if mandatory credential not found throw error
    if (!title || !dueDate) {
        throw new Error('Task title and dueDate is mandatory');
    }

    // if mandotory credentials found create the task
    const task = await Task.create({
        title: title.trim(),
        description: description ? description.trim() : '',
        priority: priority || 'Medium',
        dueDate: dueDate,
        owner: userId
    });

    // task updated, hece stats and summary invalid
    await invalidateUserCache(userId);

    return task;
};



//GET TASK SERVICE
export const getTaskService = async (query, userId) => {
    
    //fields
    const { priority, completed, sortBy, sortOrder, search } = query;

    // make the filter objcet
    const filter = { owner: userId };

    // add priority to filter 
    if (priority && ['Low', 'Medium', 'High'].includes(priority)) {
        filter.priority = priority;
    }

    // add completed to filter if provided
    if (completed != undefined) {
        if (completed === 'true') {
            filter.completed = true;
        } else if (completed === 'false') {
            filter.completed = false;
        }
    }

    // add search to filter if provided
    if (search) {
        filter.$or = [
            { title: { $regex: search, $options: 'i' } }, // match the word seach. ignore uppler lower case
            { description: { $regex: search, $options: 'i' } }
        ];
    }

    // get the tasks
    let tasks = await Task.find(filter).lean(); // find task with matches all filter conditons




    // redis loigc .........
    // calculating stats is and aggregatio quey (expensive in time), hence we store in cache
    // We cache per user and invalidate/delete when tasks change.
    let stats;
    // use getCache from redis.js and pass the key
    const cachedStats = await getCache(statsKey(userId));

    // if cahcedStats exits then (cache hit)
    if (cachedStats) {
        // Cache HIT — use cached value
        console.log(`[Redis] Cache HIT  → stats:${userId}`);
        stats = cachedStats;
    } else {
        // Cache MISS — query MongoDB and store the new result
        console.log(`[Redis] Cache MISS → stats:${userId}`);
        stats = await Task.getUserTaskStats(userId);
        await setCache(statsKey(userId), stats, STATS_TTL);
    }
    



    let order = 1;

    // apply the sorting
    if (sortBy) {
        if (sortOrder === 'desc') {
            order = -1;
        } else {
            order = 1;
        }
    }

    // 1. sorting by priority
    if (sortBy === 'priority') {
        const priorityWeight = { High: 3, Medium: 2, Low: 1 }; // define the weight before ha d

        tasks.sort((a, b) => {
            let priorityA = a.priority || 'Low'; // get priority if given else low
            let priorityB = b.priority || 'Low';
            const weightA = priorityWeight[priorityA]; // get the weight using priority
            const weightB = priorityWeight[priorityB];
            return (weightA - weightB) * order; // to control direction
        });
    }
    
    // 2. sort by dueDate
    else if (sortBy === 'dueDate') {
        tasks.sort((a, b) => {
            const timestampA = new Date(a.dueDate).getTime();
            const timestampB = new Date(b.dueDate).getTime();
            return (timestampA - timestampB) * order;
        });
    }
    // 3. sort by creation date
    else if (sortBy === 'createdAt') {
        tasks.sort((a, b) => {
            const timestampA = new Date(a.createdAt).getTime();
            const timestampB = new Date(b.createdAt).getTime();
            return (timestampA - timestampB) * order;
        });
    }
    // 4. sort by task title
    else if (sortBy === 'title') {
        tasks.sort((a, b) => {
            const titleA = a.title.toLowerCase();
            const titleB = b.title.toLowerCase();
            return titleA.localeCompare(titleB) * order;  // compare the alphabet order
        });
    }
    // 5. default: sort by createdAt ascending
    else {
        tasks.sort((a, b) => {
            const timestampA = new Date(a.createdAt).getTime();
            const timestampB = new Date(b.createdAt).getTime();
            return timestampA - timestampB;
        });
    }

    return { tasks, stats };
};




// GET TASK BY ID SERVICE
export const getTaskByIdService = async (id, userId) => {
    // find task with id, and the belonging to a user
    const task = await Task.findOne({ _id: id, owner: userId });
    
    // if task not found throw error
    if (!task) {
        throw new Error('Task not found or unauthorized');
    }

    return task;
};




// UPDATE TASK SERVICE

export const updateTaskService = async (id, body, userId) => {
    // data fields
    const { title, description, priority, dueDate, completed } = body;

    // create oject for data want to upgrade
    const updateData = {};

    // check if all filed exists, attach them to updatedData oject and clean
    if (title !== undefined)       updateData.title       = title.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (priority !== undefined)    updateData.priority    = priority;
    if (dueDate !== undefined)     updateData.dueDate     = dueDate;
    if (completed !== undefined)   updateData.completed   = completed;


    // find and update the task with the new updatedObject
    const updatedTask = await Task.findOneAndUpdate(
        { _id: id, owner: userId },
        updateData,
        { new: true, runValidators: true }
    );

    // if the task to update not found return error
    if (!updatedTask) {
        throw new Error('Task not found or unauthorized');
    }

    // Invalidate cached stats & summary — task change affects counts/summary
    await invalidateUserCache(userId);

    return updatedTask;
};




// DELETE TASK SERVICE

export const deleteTaskService = async (id, userId) => {
    
    // find the task and delete
    const deletedTask = await Task.findOneAndDelete({ _id: id, owner: userId });

    // if task to be delted not exist thrwo error
    if (!deletedTask) {
        throw new Error('Task not found or unauthorized');
    }

    // task updated, hence stats and summary invalid
    await invalidateUserCache(userId);

    return deletedTask;
};




// GET STATS SERVICE
export const getUserTaskStatsService = async (userId) => {

    // ─── REDIS: Cache stats for the dedicated stats endpoint ────────────────
    const cachedStats = await getCache(statsKey(userId));

    if (cachedStats) {
        console.log(`[Redis] Cache HIT  → stats:${userId} (stats endpoint)`);
        return cachedStats;
    }

    console.log(`[Redis] Cache MISS → stats:${userId} (stats endpoint)`);
    const stats = await Task.getUserTaskStats(userId);
    await setCache(statsKey(userId), stats, STATS_TTL);

    return stats;
};



// 7. FIND TASK BY TITLE — used by the AI chat so it can update/delete a task
export const findTaskByTitleService = async (userId, titleQuery) => {
    if (!titleQuery) return null;

    const safe = escapeRegex(titleQuery.trim()); // escapeReger - ignore special characters

    // first try - find exact match
    let task = await Task.findOne({ owner: userId, title: { $regex: `^${safe}$`, $options: 'i' } });

    // if task not fooudn in exact match try, use the conatiin
    if (!task) {
        task = await Task.findOne({ owner: userId, title: { $regex: safe, $options: 'i' } });
    }

    return task;
};


// export key generators so the gemini controller can use the same keys
export { statsKey, summaryKey, SUMMARY_TTL };