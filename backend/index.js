import express from 'express' 
import pg from "pg"
import bodyParser from "body-parser";
import cors from "cors"
import dotenv from "dotenv";
import { createTransport } from "nodemailer";
import bcrypt from 'bcryptjs';
import jsonwebtoken from "jsonwebtoken"
import verifyTokenMiddleware from "./verifyTokenMiddleware.js";
import { types } from 'pg';

const PORT=4000;
const app=express();

const corsOptions = {  //making  the  API domain restricted
  origin: "http://localhost:5173", // 
  optionsSuccessStatus: 200, // For legacy browser support
};
dotenv.config() // for using environment variables

app.use(cors(corsOptions));

const transporter=createTransport({  // create a transporter for sending mail
  service:'gmail',
  auth: {
    user: process.env.MY_GMAIL, // mail address to send mails
    pass: process.env.MY_GMAIL_PASSWORD, // Your email password or app password
  },
})
app.use(cors())  // using cors

const db=new pg.Client({  // creating database connection variables
    user: process.env.DATABASE_USER,
    host: process.env.DATABASE_HOST,
    database: process.env.DATABASE_DATABASE,
    password: process.env.DATABASE_PASSWORD,
    port: process.env.DATABASE_PORT,
  });
  types.setTypeParser(1082, val => val); // return DATE as string, e.g. "2025-05-30"
  types.setTypeParser(1083, val => val); // return TIME as string, e.g. "02:30:00"
  db.connect(); //connecting to database


  app.use(bodyParser.urlencoded({ extended: true })); //body parser to encode body data from frontend
  app.use(bodyParser.json()) 

app.post("/login",async (req,res)=>{  //login route
    let userId=req.body.userId;
    let pass=req.body.password;
    console.log(req.body)
    try
    {
      const result=await db.query("select password, staff, rooms, hotel, report from users where user_id =$1",[userId]);
      const data=result.rows[0];
      const isMatch = await bcrypt.compare(pass, data.password);
      
      if(isMatch){
        const payload={
            user_id:userId
        }
        const token= jsonwebtoken.sign(payload, process.env.SECRET_KEY);
        res.json({message:"success", values:{...data,token:token, password:""}})
      }
      else{
        res.json({message:"wrong password"});
      }
    }
    catch(err){
      res.json({message:"username already present"})
    }
})


app.post('/signup', async (req, res)=>{  // signup route
  const hotel=req.body.Hotel;
  const mobile=req.body.Mobile;
  const password=req.body.Password;
  const mail=req.body.Mail;
  const address=req.body.Address
  try{
    if((password.length<8) || (!password.includes("_") && !password.includes("@") && !password.includes("#") && !password.includes("&") && !password.includes("-") && !password.includes("%") && !password.includes("$") && !password.includes("*"))){
      res.json({message:"password must have 8 characters and must include symbols like @#$%*&"})
    }
    else{
      const saltRounds = 10; // Higher rounds = more security but slower
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      const user_id= `${new Date().getTime()}`
      const arr=[]; // for initialization of the rroms and staff column to avoid error
      const obj={} // for initialization of report object to avoid errors
      const result= await db.query("insert into users (hotel, mobile, user_id,  password,  mail, address, rooms, report, staff) values($1,$2,$3,$4,$5,$6, $7, $8, $9) ",[hotel, mobile, user_id, hashedPassword, mail, address, arr, obj, arr]);
      const payload={
            user_id:user_id
        }
      const token= jsonwebtoken.sign(payload, process.env.SECRET_KEY);
      res.json({message:'success', user_id:user_id, token:token})
      const mailOptions = {
        from: 'radhechaudhary6398@gmail.comm', // Sender address
        to: mail, // Recipient address
        subject: 'Automated Email from Hotelier', // Subject line
        text: `Hello!! Thankyou for connecting with us!! Hope the journey will be great!! Your userId is ${user_id} `, // Plain text body
        html: '<p>Hello!!<b>Thankyou for connecting with us</b>Hope the journey will be great!!</p>', // HTML body (optional)
      };
    transporter.sendMail(mailOptions, (error, info) => { // sendmail function to send mail
      if (error) {
        return console.log('Error occurred:', error);
      }
    });
    }
  }
  catch(err){
    console.log(err.message)
    res.json({message:"username already exists"})
  }
})

app.post('/verify-user', verifyTokenMiddleware, async (req, res)=>{ // verify user for session authentiacation 
    const result= await db.query('select * from users where user_id = $1',[req.user.user_id]);
    if(result.rows.length>0){
        res.json({message:'success'})
    }
    else{
        res.json({message:'invalid'})
    }
})

app.post('/update-rooms',verifyTokenMiddleware, (req, res)=>{  // route to save updated rooms data from frontend to SQL
    db.query('update users set rooms=$1 where user_id=$2', [req.body.rooms, req.user.user_id])
})



app.post('/data-submit', verifyTokenMiddleware, async(req,res)=>{{ //Save customer Data from frontend to SQL
    try{
      // findding date and time for checkout time details
        const localDate = new Date();
        const formattedDate = localDate.toLocaleDateString('en-CA')
        const now= new Date();
        const hours = String(now.getHours()).padStart(2, "0");
        const minutes = String(now.getMinutes()).padStart(2, "0");
        const currentTime = `${hours}:${minutes}`;
        const result=await db.query("insert into costumers (user_id, name, mobile, room_no, entry_date, entry_time,  out_date, out_time, members, id_no) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [req.user.user_id, req.body.name, req.body.tel, req.body.roomNo, req.body.entryDate, req.body.entryTime, formattedDate, currentTime, req.body.members, req.body.idNo]   
        )
      res.json({message:'saved successfully'})
    }
    catch(err){
      console.log(err.message)
      res.json({message:'internal error'})
    }
  }
})

app.post("/get-data",verifyTokenMiddleware, async(req,res)=>{ // route to send all the entries of the current user to it
    try{
      const result=await db.query("Select sr_no, name, mobile, room_no, members, id_no, entry_date, entry_time, out_date, out_time from costumers where user_id=$1",[req.user.user_id])
      res.json({entries:result.rows})
    }
    catch(err){
        console.log(err.message)
      res.send(err.message)
    }
})

app.post("/change-staff", verifyTokenMiddleware, async(req, res)=>{  // Route for updating staff in backend
    const staff= req.body.staff;
    db.query('update users set staff=$1 where user_id =$2',[staff, req.user.user_id])
})

app.post("/update-report", verifyTokenMiddleware, (req, res)=>{ // Route for Updating Report in frontEnd
  try{
    db.query("update users set report=$1 where user_id=$2",[req.body, req.user.user_id])
  }
  catch(err){
    console.log(err.message)
  }
})
app.listen(PORT,()=>{
    console.log(`running on port ${PORT}`)
})
