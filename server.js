const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.use('/uploads', express.static('uploads'));

// Serve HTML pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'blog.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = 'uploads/';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

// Simple data storage
let posts = [];
let users = [];
let comments = [];
let subscribers = [];
let contacts = [];
let currentId = 1;
let stats = {
  totalViews: 5283,
  totalComments: 137
};

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_here';

// INSTANT LOGIN - No credentials needed
app.post('/api/login', (req, res) => {
  console.log('Instant login triggered');
  
  // Create user if none exists
  if (users.length === 0) {
    users.push({
      id: 1,
      username: 'admin',
      email: 'admin@blog.com'
    });
  }

  // Generate token
  const token = jwt.sign(
    { id: 1, username: 'admin' }, 
    JWT_SECRET, 
    { expiresIn: '24h' }
  );

  res.json({ 
    success: true, 
    message: 'Auto-login successful',
    token,
    user: { id: 1, username: 'admin', email: 'admin@blog.com' }
  });
});

// Bypass authentication for all routes
const fakeAuth = (req, res, next) => {
  req.user = { id: 1, username: 'admin' };
  next();
};

// Stats endpoint
app.get('/api/stats', fakeAuth, (req, res) => {
  const publishedPosts = posts.filter(post => post.published);
  res.json({
    totalPosts: publishedPosts.length,
    totalDrafts: posts.length - publishedPosts.length,
    totalViews: stats.totalViews,
    totalSubscribers: subscribers.length,
    totalComments: comments.filter(c => c.approved).length
  });
});

// Get all posts
app.get('/api/posts', (req, res) => {
  const publishedOnly = !req.query.admin;
  
  let filteredPosts = publishedOnly 
    ? posts.filter(post => post.published) 
    : [...posts];
  
  filteredPosts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  res.json({
    posts: filteredPosts,
    currentPage: 1,
    totalPages: 1,
    totalPosts: filteredPosts.length
  });
});

// Get single post
app.get('/api/posts/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const post = posts.find(p => p.id === id);
  
  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }
  
  res.json(post);
});

// Create new post
app.post('/api/posts', fakeAuth, upload.single('coverImage'), (req, res) => {
  try {
    let coverImage = null;
    if (req.file) {
      coverImage = `/uploads/${req.file.filename}`;
    }
    
    const newPost = {
      id: currentId++,
      title: req.body.title,
      content: req.body.content,
      excerpt: req.body.excerpt,
      category: req.body.category,
      tags: Array.isArray(req.body.tags) ? req.body.tags : (req.body.tags || '').split(',').map(tag => tag.trim()),
      commentsEnabled: req.body.commentsEnabled !== 'false',
      published: req.body.published !== 'false',
      coverImage: coverImage,
      views: 0,
      comments: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    posts.push(newPost);
    res.json(newPost);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// Update post
app.put('/api/posts/:id', fakeAuth, upload.single('coverImage'), (req, res) => {
  const id = parseInt(req.params.id);
  const postIndex = posts.findIndex(p => p.id === id);
  
  if (postIndex === -1) {
    return res.status(404).json({ error: 'Post not found' });
  }
  
  let coverImage = posts[postIndex].coverImage;
  if (req.file) {
    if (coverImage) {
      const oldImagePath = path.join(__dirname, coverImage);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }
    coverImage = `/uploads/${req.file.filename}`;
  }
  
  posts[postIndex] = {
    ...posts[postIndex],
    title: req.body.title || posts[postIndex].title,
    content: req.body.content || posts[postIndex].content,
    excerpt: req.body.excerpt || posts[postIndex].excerpt,
    category: req.body.category || posts[postIndex].category,
    tags: req.body.tags ? (Array.isArray(req.body.tags) ? req.body.tags : req.body.tags.split(',').map(tag => tag.trim())) : posts[postIndex].tags,
    coverImage: coverImage,
    updatedAt: new Date().toISOString()
  };
  
  res.json(posts[postIndex]);
});

// Delete post
app.delete('/api/posts/:id', fakeAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const postIndex = posts.findIndex(p => p.id === id);
  
  if (postIndex === -1) {
    return res.status(404).json({ error: 'Post not found' });
  }
  
  const post = posts[postIndex];
  if (post.coverImage) {
    const imagePath = path.join(__dirname, post.coverImage);
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
  }
  
  posts.splice(postIndex, 1);
  res.json({ success: true });
});

// Comments endpoints
app.get('/api/posts/:id/comments', (req, res) => {
  const postId = parseInt(req.params.id);
  const postComments = comments.filter(comment => comment.postId === postId && comment.approved);
  res.json(postComments);
});

app.post('/api/posts/:id/comments', (req, res) => {
  const postId = parseInt(req.params.id);
  const { author, content } = req.body;
  
  if (!author || !content) {
    return res.status(400).json({ error: 'Author and content are required' });
  }
  
  const newComment = {
    id: comments.length + 1,
    postId,
    author,
    content,
    approved: false,
    createdAt: new Date().toISOString()
  };
  
  comments.push(newComment);
  res.json({ success: true, message: 'Comment submitted for approval' });
});

app.get('/api/comments', fakeAuth, (req, res) => {
  res.json(comments);
});

app.put('/api/comments/:id/approve', fakeAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const comment = comments.find(c => c.id === id);
  
  if (!comment) {
    return res.status(404).json({ error: 'Comment not found' });
  }
  
  comment.approved = true;
  res.json({ success: true, comment });
});

app.delete('/api/comments/:id', fakeAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const commentIndex = comments.findIndex(c => c.id === id);
  
  if (commentIndex === -1) {
    return res.status(404).json({ error: 'Comment not found' });
  }
  
  comments.splice(commentIndex, 1);
  res.json({ success: true });
});

// Newsletter subscription
app.post('/api/subscribe', (req, res) => {
  const { email } = req.body;
  
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }
  
  if (subscribers.find(s => s.email === email)) {
    return res.status(409).json({ error: 'Email already subscribed' });
  }
  
  subscribers.push({
    id: subscribers.length + 1,
    email,
    subscribedAt: new Date().toISOString()
  });
  
  res.json({ success: true, message: 'Successfully subscribed to newsletter' });
});

// Contact form
app.post('/api/contact', (req, res) => {
  const { name, email, subject, message } = req.body;
  
  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  
  contacts.push({
    id: contacts.length + 1,
    name,
    email,
    subject,
    message,
    sentAt: new Date().toISOString(),
    read: false
  });
  
  res.json({ success: true, message: 'Your message has been sent successfully' });
});

// Get subscribers
app.get('/api/subscribers', fakeAuth, (req, res) => {
  res.json(subscribers);
});

// Get contacts
app.get('/api/contacts', fakeAuth, (req, res) => {
  res.json(contacts);
});

// Initialize with sample posts
if (posts.length === 0) {
  posts = [
    {
      id: currentId++,
      title: "The Future of Web Development",
      content: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam euismod, nisl eget ultricies ultricies, nunc nisl aliquam nunc, eget aliquam nisl nunc eget nisl.",
      excerpt: "Exploring the latest trends in web development and what the future holds for developers.",
      category: "technology",
      tags: ["tech", "web development", "future"],
      commentsEnabled: true,
      published: true,
      coverImage: null,
      views: 284,
      comments: 12,
      createdAt: "2023-06-15T10:00:00.000Z",
      updatedAt: "2023-06-15T10:00:00.000Z"
    },
    {
      id: currentId++,
      title: "10 Best Travel Destinations for 2023",
      content: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam euismod, nisl eget ultricies ultricies, nunc nisl aliquam nunc, eget aliquam nisl nunc eget nisl.",
      excerpt: "Discover the top travel destinations to add to your bucket list this year.",
      category: "travel",
      tags: ["travel", "destinations", "adventure"],
      commentsEnabled: true,
      published: true,
      coverImage: null,
      views: 512,
      comments: 27,
      createdAt: "2023-06-10T10:00:00.000Z",
      updatedAt: "2023-06-10T10:00:00.000Z"
    }
  ];
}

// Error handling
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large' });
    }
  }
  res.status(500).json({ error: error.message });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📝 Blog: http://localhost:${PORT}`);
  console.log(`⚡ Admin: http://localhost:${PORT}/admin`);
  console.log(`✅ Login with any username (no password needed)`);
});

module.exports = app;
