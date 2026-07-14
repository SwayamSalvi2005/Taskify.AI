import mongoose from 'mongoose';

export const connectDB = async () =>{
    try{
        // get the string from env
        const connectionString = process.env.MONGODB_URI;
        
        // if string not exists through error
        if(!connectionString){
            throw new Error('Error! mongoDB string not found in .env');
        }

        // if string exists connect the database
        const connectdb = await mongoose.connect(connectionString);
        
        console.log(`MongoDB connection succesfull: ${connectdb.connection.host}`);
        console.log(`Dabtabase name: ${connectdb.connection.name}`);


        // mongoDB connection events
        mongoose.connection.on('error', (error) =>{
            console.error('MongoDB connection failed', error.message);
        });

        mongoose.connection.on('disconnected', () =>{
            console.log('MongoDB database disconnected');
        });
    }
    catch(error){
        console.error('Error! MongoDB connection failed', error.message);
        process.exit(1); // exit / shut the process at once
    }
}