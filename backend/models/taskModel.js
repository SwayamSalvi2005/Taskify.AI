import mongoose from "mongoose";

// task proioity levels defined 
const priorityLevels = ['Low', 'Medium', 'High'];

const taskSchema = new mongoose.Schema({
    title:{
        type: String,
        required: [true, 'Please enter the title'],
        trim: true,
        minlength: [3, 'Title must be atleast 3 characters'],
        maxlength: [100, 'Title cannot exceed 100 characters'],
    },
    description:{
        type: String,
        trim: true,
        default: '',
        maxlength: [500, 'Description cannot exceed 500 characters']
    },
    priority:{
        type: String,
        enum:{
            // only alllow the defined pririty levels
            values: priorityLevels,
            message: 'Priority must be either Low, Medium or High'
        },
        default: 'Medium',
        index: true // index is given for later sorting/filtering
    },
    dueDate:{
        type: Date,
        required: [true, 'Due date is required'],
        validate: {
            validator: function(value){
                const today = new Date();
                today.setHours(0,0,0,0); // set time to 12am , cause we only needt compare date not time
                const dueDate = new Date(value); // convert user input in js date object
                dueDate.setHours(0,0,0,0);
                return dueDate >= today;
            },
            message: 'Due date cannot be in the past'
        }
    },
    completed:{
        type: Boolean,
        default: false,
        index: true // index is given for later sorting/filtering
    },
    owner:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // object id belongs to User model
        required: [true, 'Task must belong to an User'],
        index: true // index is given for later sorting/filtering
    }
}, {
    timestamps: true
});


taskSchema.index({owner: 1, completed: 1}); // first sort by owner then completed
taskSchema.index({owner: 1, priority: 1}); // first sort by owner then priority
taskSchema.index({owner: 1, dueDate: 1}); // first sortby owner then due date


// function to get the user statistics for a user
taskSchema.statics.getUserTaskStats = async function(userID){
    const stats = await this.aggregate([
        {$match: {owner :userID} }, // match- only keep tasks of a specific user
        {
        $group: { // group - a way to do calculation on docuemtns
            _id: null,  // dont group by anyting
            total: {$sum:1}, // for each doucument add 1
            completed: {$sum: {$cond: ['$completed', 1, 0] } }, // if completed is true then add 1 lese 0
            pending: {$sum: {$cond: ['$completed', 0, 1] } }, // if completed is true then add 0 else 1
            lowPriority: {$sum: {$cond: [ {$eq: ['$priority', 'Low']}, 1, 0 ] } }, // if priority is low then add 1 lese 0
            mediumPriority: {$sum: {$cond: [ {$eq: ['$priority', 'Medium']}, 1, 0 ] } }, // if priority is medium then add 1 lese 0
            highPriority: {$sum: {$cond: [ {$eq: ['$priority', 'High']}, 1, 0 ] } }, // if priority is high then add 1 lese 0
            dueToday: {
                $sum: {  // converts date to string remove time and if due date is today add 1 else 0
                    $cond: [ {
                        $eq : [{$dateToString: {format: '%Y-%m-%d', date: '$dueDate'} },
                            {$dateToString: {format: '%Y-%m-%d', date: new Date()} } ]
                }, 1, 0]
                }
            }
        }
        }
    ]);

    if(stats.length > 0){
        return stats[0];
    }
    else{ // if stats has annything return it, else return all 0
        return{
            total: 0,
            completed: 0,
            pending: 0,
            lowPriority: 0,
            mediumPriority: 0,
            highPriority: 0,
            dueToday: 0
        }
    }
}


const Task = mongoose.model('Task', taskSchema); // create Task using taskSchema
export default Task;