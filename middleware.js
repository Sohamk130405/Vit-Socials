const Post = require("./models/posts");
const Comment = require("./models/comments");
const ExpressError = require("./utils/ExpressError.js");
const { postSchema , commentSchema  } = require("./schema.js");


module.exports.isLoggedIn = (req,res,next)=>{
    if(!req.isAuthenticated()){
        req.session.redirectUrl = req.originalUrl;
        req.flash("error","You must be logged in first!");
        return res.redirect("/user/login");
      }
      next();
};

module.exports.saveRedirectUrl = (req,res,next)=>{
    if(req.session.redirectUrl){
        res.locals.redirectUrl =req.session.redirectUrl;
      }
      next();
};

module.exports.isOwner = async ( req, res, next) =>{
  let id = req.params.id;
  let post = await Post.findById(id);
  if(!post.owner.equals(res.locals.currUser._id)){
    req.flash("error","You dont have permission to edit");
    return res.redirect(`/posts/${id}`);
  };
  next();
};


module.exports.isCommentAuthor = async ( req, res, next) =>{
  let commentId = req.params.commentId;
  let comment = await Comment.findById(commentId);
  if(!comment.author.equals(res.locals.currUser._id)){
    req.flash("error","You dont have permission to delete comment of other authors");
    return res.redirect("/posts");
  };
  next();
};

module.exports.validatePosts = (req,res,next)=>{

    let { error } = postSchema.validate(req.body);
    if (error) {
      let errMsg = error.details.map((el) => el.message).join(",");
      throw new ExpressError(400, errMsg);
    } else {
      next();
    }
  };

module.exports.validateComment = (req, res, next) => {
  let { error } = commentSchema.validate(req.body);
  if (error) {
    let errMsg = error.details.map((el) => el.message).join(",");
    throw new ExpressError(400, errMsg);
  } else {
    next();
  }
};  