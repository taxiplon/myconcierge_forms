
import express from 'express';
const router = express.Router();

// Route to render everyPayForm.ejs
router.get('/everypay', (req, res) => {
  res.render('everypay.ejs', { root: './views' });
});


// Route to handle form submission for form1
router.post('/everypay/submit', (req, res) => {
  console.log("in everypay");
  // Handle form submission logic
  //res.redirect('/everyPayForm');
});

export default router;