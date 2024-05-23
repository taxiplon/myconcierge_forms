import express from 'express';
const router = express.Router();


// Route to render hotel.ejs
router.get('/hotel', (req, res) => {
  res.render('hotel.ejs', { root: './views' });
});

// Route to handle form submission for form1
// router.post('/hotel/submit', (req, res) => {
//   // Handle form submission logic for form1
//   //const hotelName = req.body;
//   //const selectesOptionValue = selectesOption.cType;
//   //console.log(hotelName); // Debugging: Log the entire request body to see what data is being sent
//   console.log("before everypay");

  
//   res.redirect('/everypay');

// });


export default router;