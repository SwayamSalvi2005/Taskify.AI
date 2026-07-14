import User from "../models/userModel.js";
import Task from "../models/taskModel.js";

import validator from 'validator';
import jwt from 'jsonwebtoken';


// method to generate token
const generateToken = (userID) =>{
    // create a token
    return jwt.sign(
        {id: userID},
        process.env.JWT_SECRET,
        {expiresIn: process.env.JWT_EXPIRES_IN}
    );
};


// method to send response in controller
export const sendAuthResponse = (user) =>{
    // this creates a token
    const token = generateToken(user._id);

    return{
        token,
        user
    }
}



// 1. REGISTER USER SERVICE
export const registerService = async({name, email, password}) =>{

    //if credentials does not exists throw error
    if(!name || !email || !password){
        throw new Error('Please provide name, email and password');
    }

    // validate email format
    if(!validator.isEmail(email)){
        throw new Error('Please provide a valid email')
    }

    //clean the email
    const normalEmail = email.toLowerCase().trim()

    // check if user already exists
    const existingUser = await User.findOne({email: normalEmail});

    //if user already exists throw error
    if(existingUser){
        throw new Error('User with this email already exists');
    }


    //if user does not exists, create the user
    const user = await User.create({
        name: name.trim(),
        email: normalEmail,
        password: password
    });

    return sendAuthResponse(user);
}



// 2. LOGIN SERVICE
export const loginService = async ({email, password}) =>{
    
    //if credentials does not exists throw error
    if(!email || !password){
        throw new Error('Please provide email and password')
    }

    // validate email format
    if(!validator.isEmail(email)){
        throw new Error('Please provide a valid email')
    }
    
    //clean the email
    const normalEmail = email.toLowerCase().trim();

    // get the user with password
    const user = await User.findOne({email: normalEmail}).select('+password');

    // if user not exist throw error
    if (!user) {
        throw new Error("Invalid email or password");
    }

    // if user exists, check password
    const isPasswordValid = await user.comparePassword(password);

    // if pass incorrect throw error
    if(!isPasswordValid){
        throw new Error('Invalid email or password')
    }

    // return the token and user, if he is authenticat
    return sendAuthResponse(user);
}



// 3. UPDATE USER SERVICE
export const updateUserService = async(userID, {name, email}) =>{
    
    //if credentials does not exists throw error
    if (!name || !email) {
        throw new Error("Please enter name and email");
    }
    
    //check email format
    if (!validator.isEmail(email)) {
        throw new Error("Invalid email format");
    }

    //clean emai
    const normalEmail = email.toLowerCase().trim();

    // check if email is already taken
      /// $ne = not equal
    const existingUser = await User.findOne({email: normalEmail, _id: { $ne: userID} });

    // if user exists, email is alredy taken
    if (existingUser) {
        throw new Error("Email already in use");
    }

    // if email not taken update it 
    const updatedUser = await User.findOneAndUpdate(
        {_id: userID},
        {
            name: name.trim(),
            email: normalEmail
        },{
            new: true, // give the updated document
            runValidators: true // run validation on this
        }
    );

    return updatedUser;
}



// 4. UPDATE PASSWORD SERVICE
export const updatePasswordService = async (userId, { currentPassword, newPassword }) => {

    //if credentails not found, throw error
    if (!currentPassword || !newPassword) {
        throw new Error("Please provide both current and new password");
    }

    // validate new password 
    if (!validator.isStrongPassword(newPassword, {
        minLength: 8,
        minLowercase: 0,
        minUppercase: 0,
        minNumbers: 0,
        minSymbols: 0
    })) {
        throw new Error("Password should atleast 8 characters and contain at least one uppercase letter, one lowercase letter, one number, and one special character");
    }

    // get user with old password
    const user = await User.findById(userId).select("+password");

    // check the current pass entered by user is correct?
    const isPasswordValid = await user.comparePassword(currentPassword);

    // if not correct
    if (!isPasswordValid) {
        throw new Error("Current password is incorrect");
    }

    // uf original password is correct, updateit with the new pass
    // update password ... pre-save hook(userModel) will hash password
    user.password = newPassword;
    await user.save();

    return sendAuthResponse(user);
};




// 5. DELETE USER SERVICE
export const deleteUserService = async(userID, {currentPassword, confirmMessage}) =>{

    // if password not entered
    if(!currentPassword){
        throw new Error('Please provide password')
    }

    // if confim message not entered
    if(confirmMessage !== 'DELETE'){
        throw new Error('Type "DELETE" to continue')
    }

    // get the user with that id and password
    const user = await User.findById(userID).select("+password");

    //if user not exits through error
    if(!user){
        throw new Error('User not found')
    }
    
    // compare the entered currett password
    const isPasswordValid = await user.comparePassword(currentPassword);

    //if pass invalid through error
    if(!isPasswordValid){
        throw new Error('Incorrect password')
    }

    // Delete all tasks belonging to this user first
    await Task.deleteMany({ owner: userID });

    // delete the user
    await User.findByIdAndDelete(userID);

    return;
}
