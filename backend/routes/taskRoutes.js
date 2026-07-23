import express from 'express';

import{
    createTask,
    getTask,
    getTaskById,
    updateTask,
    deleteTask,
    getUserTaskStats
} from '../controllers/taskController.js'

import { authMiddleware } from '../middlewares/auth.js';


const taskRouter = express.Router();

taskRouter.use(authMiddleware);


taskRouter.get('/stats/summary', getUserTaskStats);

taskRouter.route('/')
    .get(getTask)
    .post(createTask);

taskRouter.route('/:id')
    .get(getTaskById)
    .put(updateTask)
    .delete(deleteTask)

export default taskRouter;