import{
    createTaskService,
    getTaskService,
    getTaskByIdService,
    updateTaskService,
    deleteTaskService,
    getUserTaskStatsService
} from '../services/taskService.js'


// 1. CREATE TASK
export const createTask = async (req, res, next) =>{
    try{
        // extracts the data mentioned in service from req.body
        const task = await createTaskService(req.body, req.user._id);

        return res.status(201).json({
            success: true,
            message: 'Task successfully created',
            task: task
        });
    }
    catch(error){
        next(error);
    }
};


// 2. GET TASK
export const getTask = async (req, res, next) =>{
    try{
        // extracts the data mentioned in service from req.body
        const result = await getTaskService(req.query, req.user._id);

        return res.status(200).json({
            success: true,
            tasks: result.tasks,
            stats: result.stats
        });
    }
    catch(error){
        next(error);
    }
}


// 3. GET TASK BY ID
export const getTaskById = async(req, res, next) =>{
    try{
        // extracts the data mentioned in service from req.body
        const task = await getTaskByIdService(req.params.id, req.user._id);

        return  res.status(200).json({
            success: true,
            task: task
        });
    }
    catch(error){
        next(error);
    }
}



// 4. UPDATE TASK
export const updateTask = async(req, res, next) =>{
    try{
        // proivde all the data field to the service fucntion
        const task = await updateTaskService(
            req.params.id,
            req.body,
            req.user._id
        );

        return res.status(200).json({
            success: true,
            message: 'Task updated successfully',
            updatedtask: task
        });
    }
    catch(error){
        next(error);
    }
}



// 5. DELETE TASK
export const deleteTask = async (req, res, next) =>{
    try{
        // extracts the data mentioned in service from req.param
        const task = await deleteTaskService(req.params.id, req.user._id);

        return res.status(200).json({
            success: true,
            message: 'Task successfully deleted',
            deletedTask: task
        });
    }
    catch(error){
        next(error);
    }
};



// 5. GET TASK STATS 
export const getUserTaskStats = async (req, res, next) =>{
    try{
        // proivde necessary data to service fucntion
        const stats = await getUserTaskStatsService(req.user._id);

        return res.status(200).json({
            success: true,
            stats: stats
        });
    } 
    catch(error){
        next(error);
    }
};