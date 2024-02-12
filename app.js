if (process.env.NODE_ENV != "production") {
  require("dotenv").config();
}

const express = require("express");
const mongoose = require("mongoose");
const methodOverride = require("method-override");
const flash = require("connect-flash");
const engine = require("ejs-mate");
const path = require("path");
const app = express();
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const User = require("./models/users.js");
const Notice = require("./models/notices.js");
const Post = require("./models/posts.js");
const Chat = require("./models/chats.js");
const Comment = require("./models/comments.js");
const wrapAsync = require("./utils/wrapAsync.js");

const profanityFilter = require('profanity-filter');
const Filter = require('bad-words');
const filter = new Filter();


const {
  isLoggedIn,
  isOwner,
  isCommentAuthor,
  validatePosts,
  validateComment,
  saveRedirectUrl,
} = require("./middleware.js");

const multer = require("multer");
const { storage } = require("./cloudConfig.js");
const { verify } = require("crypto");
const Complaint = require("./models/complaints.js");
const { wrap } = require("module");
const upload = multer({ storage });

app.engine("ejs", engine);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));

const sessionOptions = {
  secret: process.env.SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    expires: Date.now() + 1000 * 60 * 60 * 24 * 7,
    maxAge: 1000 * 60 * 60 * 24 * 7,
    httpOnly: true,
  },
};

app.use(session(sessionOptions));
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// twilio api
const accountSid = process.env.APISID;
const authToken = process.env.APITOKEN;

const client = require('twilio')(accountSid, authToken);

// Database Connection
const dbUrl = process.env.DBURL;

async function main() {
  await mongoose.connect(dbUrl);
}
main()
  .then(() => {
    console.log("Connected to DB");
  })
  .catch((err) => console.log(err));

// Local Variables
app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.currUser = req.user;
  next();
});

app.listen(8080, () => {
  console.log("Server is listening to port 8080");
});

app.get("/", (req, res) => {
  res.send("Server is working fine");
});

// User Login

// signup route
app
  .route("/user/signup")
  .get((req, res) => {
    res.render("users/signup.ejs");
  })
  .post(
    upload.single("idCard"),
    wrapAsync(async (req, res) => {
      try {
        const url = req.file.path;
        let { username, email, password, name, contact , year , branch , type } = req.body;

        if (filter.isProfane(username) || filter.isProfane(name)) {
          req.flash('error', 'Profanity is not allowed in username or name.');
          return res.redirect('/user/signup');
        }
        const newUser = new User({
          username: username,
          email: email,
          name: name,
          contact: contact,
          idCard: url,
          year: year,
          branch: branch,
          type: type,
        });
        let registeredUser = await User.register(newUser, password);
        const anonymousUser = new User({
          username: "anonymous_" + Math.random().toString(36).substring(7),
          linkedAccounts: registeredUser._id,
          status: "Verified"
          // Other properties for the anonymous account as needed
        });
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              
        const savedAnonymousUser = await anonymousUser.save();

        // Link the public account to the anonymous account
        registeredUser.linkedAccounts = savedAnonymousUser._id;
        await registeredUser.save();

        // Log in the public user account
        req.login(registeredUser, (err) => {
          if (err) {
            return next(err);
          }
          req.flash("success", "Welcome To VitSocials");
          res.redirect("/posts");
        });
      } catch (e) {
        req.flash("error", e.message);
        res.redirect("/user/signup");
      }
    })
  );

// login route
app
  .route("/user/login")
  .get((req, res) => {
    res.render("users/login.ejs");
  })
  .post(
    saveRedirectUrl,
    passport.authenticate("local", {
      failureRedirect: "/user/login",
      failureFlash: true,
    }),
    async (req, res) => {
      req.flash("success", "Welcome Back To VitSocials");
      res.redirect(res.locals.redirectUrl || "/posts");
    }
  );

// logout route
app.get("/user/logout", (req, res, next) => {
  req.logOut((err) => {
    if (err) {
      return next(err);
    }
    req.flash("success", "logged you out!");
    res.redirect("/user/login");
  });
});


//  route for account switch
app.get("/user/switch/:linkedAccountId", isLoggedIn, async (req, res) => {
  try {
    const { linkedAccountId } = req.params;
    
    // Ensure the linked account belongs to the logged-in user
    const user = await User.findById(req.user._id).populate('linkedAccounts');
    
    if (!user || !user.linkedAccounts || !user.linkedAccounts._id.equals(linkedAccountId)) {
      req.flash("error", "Invalid account switch attempt");
      return res.redirect("/posts");
    }

    // Switch the user's session to the linked account
    req.login(user.linkedAccounts, (err) => {
      if (err) {
        return next(err);
      }
      req.flash("success", `Switched to ${user.linkedAccounts.username} successfully`);
      res.redirect("/posts");
    });
  } catch (error) {
    console.error("Error during account switch:", error);
    req.flash("error", "Error during account switch");
    res.redirect("/posts");
  }
});


// Admin
// verify route

app.post("/:userId", isLoggedIn, wrapAsync(async (req, res) => {
  await User.findByIdAndUpdate(req.params.userId, { status: req.body.status });
  req.flash("success", "Account Verified Successfully");


  res.redirect("/posts");
}));

app.delete("/:userId", isLoggedIn, wrapAsync(async (req, res) => {
  await User.findByIdAndDelete(req.params.userId);
  req.flash("success", "Account Rejected Successfully");
  res.redirect("/posts");
}));

// notice route
app.get("/notices" , wrapAsync(async (req,res)=>{
  let allNotices = await Notice.find();
  res.render("notices/notices.ejs" , { allNotices });
}));

app.get("/notices/new" , (req,res)=>{
  res.render("notices/addNotice.ejs");
});

app.put("/notices" ,wrapAsync( async (req,res)=>{

   let newNotice = new Notice(req.body.notice);
   const titleContainsProfanity = filter.isProfane(req.body.notice.title);
    const descriptionContainsProfanity = filter.isProfane(req.body.notice.description);

    if (titleContainsProfanity || descriptionContainsProfanity) {
      req.flash('error', 'Profanity is not allowed in title or description.');
      return res.redirect('/notices');
    }
   newNotice.author  = req.user._id;
   await newNotice.save();
   res.redirect("/notices");
}));

async function cleanUpExpiredNotices() {
  try {
    const result = await Notice.deleteMany({ expiresAt: { $lt: new Date() } });
    console.log(`${result.deletedCount} expired notices deleted.`);
  } catch (error) {
    console.error("Error cleaning up expired notices:", error);
  }
}

// Run the cleanup task on a schedule (e.g., using a cron job or setTimeout)
setInterval(cleanUpExpiredNotices, 24 * 60 * 60 * 1000); // Run every 24 hours


// Complaint Route
app.get("/complaints" , wrapAsync(async (req,res)=>{
  let allComplaints = await Complaint.find().populate("author");
  res.render("complaints/complaint.ejs" , { allComplaints });
}));

app.get("/complaints/new" , (req,res)=>{
  res.render("complaints/addComplaint.ejs");
});

app.put("/complaints" ,wrapAsync( async (req,res)=>{

   let newComplaint = new Complaint(req.body.complaint);
   const titleContainsProfanity = filter.isProfane(req.body.complaint.title);
    const descriptionContainsProfanity = filter.isProfane(req.body.complaint.description);

    if (titleContainsProfanity || descriptionContainsProfanity) {
      req.flash('error', 'Profanity is not allowed in title or description.');
      return res.redirect('/complaints');
    }
   newComplaint.author  = req.user._id;
   await newComplaint.save();
   res.redirect("/posts");
}));



// Posts Route

app.get("/posts", isLoggedIn, wrapAsync(async (req, res) => {
  let allPosts = await Post.find();
  let Users = await User.find();
  let user  = await User.findOne(req.user._id).populate("linkedAccounts");
  res.render("posts/index.ejs", { allPosts, Users , user });
}));

app.get("/posts/new",isLoggedIn,wrapAsync( async (req, res) => {
  let user  = await User.findOne(req.user._id).populate("linkedAccounts");
  res.render("posts/new.ejs" , { user });
}));

app.put("/posts",isLoggedIn, upload.single("image"), wrapAsync(async (req, res) => {
  const newPost = new Post(req.body.post);
  // Profanity check for post title and description
  if (filter.isProfane(req.body.post.title) || filter.isProfane(req.body.post.description)) {
    req.flash('error', 'Profanity is not allowed in the post title or description.');
    return res.redirect('/posts');
  }
  newPost.user = req.user._id;
  newPost.username = req.user.username;
  if (req.file) {
    newPost.image = req.file.path;
  }
  await newPost.save();
  res.redirect("/posts");
}));

app.delete("/posts/:id/",isLoggedIn, wrapAsync(async (req, res) => {
  const { id } = req.params;
  await Post.findByIdAndDelete(id);
  req.flash("success", "Post Deleted Successfully!");
  res.redirect("/posts");
}));


app.get("/posts/:id/edit",isLoggedIn, wrapAsync(async (req, res) => {
  let user  = await User.findOne(req.user._id).populate("linkedAccounts");
  const post = await Post.findById(req.params.id);
  if (!post) {
    req.flash("error", "Requested listing does not exist!");
    res.redirect("/listings");
  }
  let orgImgUrl = post.image;
  orgImgUrl=orgImgUrl.replace("/upload","/upload/h_200,w_250");
  res.render("posts/edit.ejs" , { user , post , orgImgUrl });
}));

app.patch("/posts/:id",isLoggedIn,upload.single('post[image]'),wrapAsync(async (req, res) => {
  let id = req.params.id;
  // Profanity check for post title and description
  if (filter.isProfane(req.body.post.title) || filter.isProfane(req.body.post.description)) {
    req.flash('error', 'Profanity is not allowed in the post title or description.');
    return res.redirect('/posts');
  }
  let post = await Post.findByIdAndUpdate(id, { ...req.body.post });
  if (typeof req.file !== "undefined") {
    const url = req.file.path;
    post.image = url;
    await post.save();
  }
  req.flash("success", "Post Updated Successfully!");
  res.redirect(`/posts/${id}`);
}));


app.get(
  "/posts/:id", isLoggedIn,
  wrapAsync(async (req, res) => {
    const { id } = req.params;
    let user  = await User.findOne(req.user._id).populate("linkedAccounts");
    const post = await Post.findById(id)
      .populate({
        path: "comments",
        populate: {
          path: "author",
        },
      })
      .populate("user");
    if (!post) {
      req.flash("error", "Requested post does not exist!");
      res.redirect("/post");
    }
    res.render("posts/show.ejs", { post , user});
  })
);

// Comments And Likes

app.post("/posts/:id/comments",isLoggedIn, wrapAsync(async (req, res) => {
    let post = await Post.findById(req.params.id);
    let newComment = new Comment(req.body.comment);
    newComment.author = req.user._id;
    if (filter.isProfane(req.body.comment.comment)) {
        req.flash('error', 'Profanity is not allowed in comments.');
        return res.redirect(`/posts/${req.params.id}`);
    }
        // Add the comment to the post's comments array
        post.comments.push(newComment);
        await newComment.save();
        await post.save();
        req.flash("success", "Your comment is shared successfully!");
        res.redirect(`/posts/${req.params.id}`);
}));



app.post("/posts/:id/like",isLoggedIn, wrapAsync(async (req, res) => {
  let post = await Post.findById(req.params.id);
      // Handle like/dislike functionality
      if (req.body.like) {
          const userIndex = post.like.indexOf(req.user._id);

          if (userIndex === -1) {
              // If user hasn't liked the post, add like
              post.like.push(req.user._id);
              req.flash("success", "You liked the post!");
          } else {
              // If user has liked the post, remove like (dislike)
              post.like.splice(userIndex, 1);
              req.flash("success", "You disliked the post!");
          }
      }  
  await post.save();
  res.redirect(`/posts`);
}));





app.delete("/posts/:id/comments/:comId",isLoggedIn, wrapAsync(async (req, res) => {
  const { id, comId } = req.params;
  await Post.findByIdAndUpdate(id, { $pull: { comments: comId } });
  await Comment.findByIdAndDelete(comId);
  req.flash("success", "Comment Deleted Successfully!");
  res.redirect(`/posts/${id}`);
}));


// Chats Route

app.get("/chats" ,isLoggedIn, wrapAsync( async (req,res)=>{
  let receiver = false;
  let faculties = await User.find( { type : "Faculty" } );
  if(req.user.type === "Faculty"){
    faculties = await User.find( { type : "Student" } );
  }
  res.render("chats/chats.ejs" , { receiver , faculties } );
}));


app.get("/chats/:id" , isLoggedIn, wrapAsync(async (req,res)=>{
  let receiver = await User.findById(req.params.id);
  let msg2 = await Chat.find({ to : req.params.id}).sort({ createdAt: 1 });
  let msg1 = await Chat.find({ to : req.user._id }).sort({ createdAt: 1 });
  let faculties = await User.find( { type : "Faculty" } );
  if(req.user.type === "Faculty"){
    faculties = await User.find( { type : "Student" } );
  }
  res.render("chats/chats.ejs" , { receiver , faculties , msg1 , msg2 } );
}));


app.post("/chats/:senderId/:receiverId" ,isLoggedIn, wrapAsync( async (req,res)=>{
  let receiver = await User.findById(req.params.receiverId);
  let faculties = await User.find( { type : "Faculty" } );
  if(req.user.type === "Faculty"){
    faculties = await User.find( { type : "Student" } );
  }
  if (filter.isProfane(req.body.msg)) {
    // Handle profanity - you can choose to reject the message or handle it in a specific way
    req.flash('error', 'Profanity is not allowed in comments.');
    return res.redirect(`/chats/${req.params.receiverId}`);
  }
  let newMsg = new Chat({
    msg : req.body.msg,
    from: req.params.senderId,
    to: req.params.receiverId,
  });
  await newMsg.save();
  let msg2 = await Chat.find({ to : req.params.receiverId}).sort({ createdAt: 1 });
  let msg1 = await Chat.find({ to : req.user._id}).sort({ createdAt: 1 });

  res.render("chats/chats.ejs" , { receiver , faculties , msg1 , msg2 } );
}));

app.use((err, req, res, next) => {
  let { status = 500, message = "Some Error Occured" } = err;
  res.render("layouts/error.ejs", { message });
  next();
});
