import mongoose from 'mongoose';
import validator from 'validator';
import bcrypt from 'bcryptjs';


const userSchema = new mongoose.Schema({
    name:{
        type: String,
        required: [true, 'Name is required'],
        trim: true,
        minlength: [2, 'Name must be a least 2 characters'],
        maxlength: [50, 'Name cannot exceed 50 characters']
    },
    email:{
        type: String, 
        required: [true, 'Email is required'],
        trim: true,
        unique: true,
        lowercase: true,
        validate: [validator.isEmail, 'Please provide a valid email']
    },
    password:{
        type: String,
        required: [true, 'Password is required'],
        trim: true,
        validate: {
            validator: function(value){
                return validator.isStrongPassword(value, {
                    minLength: 8,
                    minLowercase: 0,
                    minUppercase: 0,
                    minNumbers: 0,
                    minSymbols: 0
                });
            },
            message: 'Password should atleast 8 characters and contain at least one uppercase letter, one lowercase letter, one number, and one special character'
        },
        select: false //do not return password in default queries
    }
}, {timestamps: true});  // sets automatic createdAt and updatedAt


// hash the password only if it is modified
userSchema.pre('save', async function() {
    // if not modified return as it is
    if (!this.isModified('password')) return;
    
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
});


// method for comparing password
userSchema.methods.comparePassword = async function(candidatePassword){
    return await bcrypt.compare(candidatePassword, this.password);
}


// remove sensitive information befire converting to json
userSchema.methods.toJSON = function(){
    const user = this.toObject();
    delete user.password;
    delete user.__v; // __v is the version key
    return user;
}


const User = mongoose.model('User', userSchema); // create User from userSchema
export default User;