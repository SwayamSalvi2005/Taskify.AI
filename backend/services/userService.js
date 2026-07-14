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
