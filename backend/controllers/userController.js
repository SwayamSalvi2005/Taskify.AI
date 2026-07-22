import{
    loginService,
    registerService,
    updateUserService,
    updatePasswordService,
    deleteUserService
} from "../services/userService.js"


// 1. REGISTER USER
export const registerUser = async (req, res, next) =>{
    try{
        // extracts the data mentioned in serive from req.body
        const data = await registerService(req.body)

        res.status(201).json({
            success: true,
            message: "Registration successfull",
            user: data.user,
            token: data.token
        });
    }
    catch(error){
        next(error)
    }
}



// 2. LOGIN USER
export const loginUser = async (req, res, next) =>{
    try{
         // extracts the data mentioned in servive from req.body
        const data = await loginService(req.body);

        res.status(200).json({
            success: true,
            message: 'Login was successful',
            user: data.user,
            token: data.token
        });
    }
    catch(error){
        next(error)
    }
}



// 3. LOGOUT USER
export const logoutUser = async (req, res, next) =>{
    // logout is handled by frontend by removing the token
    // this endpoint is only used to inform the user
    return res.status(200).json({
        success: true,
        message: 'User logged out successfully'
    }) ;
}



// 4. GET CURRENT USER
export const getCurrentUser = async (req, res, next) =>{
    res.status(200).json({
        success: true,
        user: req.user // user was attached to req in auth middleware
    })
}    




// 5. UPDATE USER
export const updateUser = async (req, res, next) =>{
    try{
        // extracts the data mentioned in service from req.body
        const user = await updateUserService(req.user._id, req.body);

        res.status(200).json({
            success: true,
            message: 'User updated successfully',
            user
        });
    }
    catch(error){
        next(error)
    }
}



// 6. UPDATE USER PASSWORD
export const updateUserPassword = async(req, res, next) =>{
    try{
        //extracts the data mentioned in service from req.body
        const data = await updatePasswordService(req.user._id, req.body);

        res.status(200).json({
            success: true,
            message: 'Password updated successfully'
        });
    }
    catch(error){
        next(error)
    }
}




// 7. DELETE USER 
export const deleteUser = async (req, res, next) =>{
    try{
        //extracts the data mentioned in service from req.body
        const data = await deleteUserService(req.user._id, req.body);

        res.status(200).json({
            success: true,
            message: "Account deleted successfully"
        });
    }
    catch(error){
        next(error);
    }
}