import jwt from 'jsonwebtoken';
import User from '../models/userModel.js';


export const authMiddleware = async (req, res, next) =>{

    try{
        let token;

        // find the token in req headers
        if(req.headers.authorization && req.headers.authorization.startsWith('Bearer ')){
            token = req.headers.authorization.split(' ')[1];
        }
        // find the token in cookies 
        else if(req.cookies && req.cookies.token){
            token = req.cookies.token;
        }
        //token not found
        else{
            return res.status(401).json({
                success: false,
                message: 'Authentication failed, please provide a valid token'
            });
        }

        // token not found
        if(!token){
            return res.status(401).json({
                success: false,
                message: 'Authorization token is missing'
            });
        }

        // if token exists verify the user
        const decodedToken = jwt.verify(token, process.env.JWT_SECRET);

        // get the user using token
        const user = await User.findById(decodedToken.id).select('+password');

        // if user does not exists
        if(!user){
           return res.status(401).json({  
                 success: false,
                 message: 'User with this token no longer exists'
             }); 
        }

        // if user exists attach it to the req object
        req.user = user;
        next();
    }
    catch(error){
        next(error);
    }
}