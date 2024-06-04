import express from 'express';
import bodyParser from 'body-parser';
import pkg from 'pg';
const { Pool } = pkg;
import multer from 'multer';
import fs from 'fs';
import bcrypt from 'bcrypt';
import passport from "passport";
import { Strategy } from "passport-local";
import session from "express-session";
import env from "dotenv";
import { Strategy as LocalStrategy } from 'passport-local';
import flash from 'connect-flash';
import debug from 'debug';
import compression from 'compression';
import helmet from "helmet";
import { rateLimit } from 'express-rate-limit'



const app = express();
const port = process.env.PORT || 3001;
const debugMain = debug('app:main');
const debugDB = debug('app:db');


const saltRounds = process.env.ENCRYPTION_ROUNDS;
env.config();

app.set('view engine', 'ejs');

// Middleware to parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));0
app.use(express.static("public"));
app.use(compression());
app.use(
  session({
    secret: process.env.SESSION_SECR,
    resave: false,
    saveUninitialized: true,
  })
);
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      // Add more directives as needed based on your CSP requirements
    },
  })
);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later"
});

// Apply the rate limiter to all requests
app.use(limiter);

// Set up multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage: storage });

// Create a connection pool
const pool = new Pool({
  user: process.env.DATABASE_USER,
  host: process.env.DATABASE_HOST,
  database: process.env.DATABASE_NAME,
  password: process.env.DATABASE_PASSWORD,
  port: process.env.DATABASE_PORT,
});

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
app.get('/login', compression(), (req, res) => {
  const message = req.flash('error') || '';
  res.render('login', { message: message });
});

// Route for handling login form submission
app.post('/login', passport.authenticate('local', {
  successRedirect: '/',
  failureRedirect: '/login',
  failureFlash: true
}));

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

app.get('/register', compression(), (req, res) => {
  const { message } = req.query;
  res.render('register', { message });
});


app.post('/register', compression(), async (req, res) => {
  // Extract email and passwords from the request body
  const email = req.body.registerEmail;
  const password1 = req.body.registerPsw1;
  const password2 = req.body.registerPsw2;

  let message; // Initialize errorMessage variable

  // Check if passwords match
  if (password1 !== password2) {
    message = "Οι κωδικοί δεν ταιριάζουν.";
    return res.redirect(`/register?message=${message}`);
  }

  let client;
  try {
    client = await pool.connect();

    // Check if the email already exists in the database
    const checkResult = await client.query("SELECT * FROM users WHERE email = $1", [email]);

    if (checkResult.rows.length > 0) {
      message = "Ο χρήστης υπάρχει ήδη. Δοκιμάστε να κάνετε σύνδεση.";
      return res.redirect(`/register?message=${message}`);
    }

    // Hashing the password and saving it in the database
    const hash = await bcrypt.hash(password1, 10); // 10 is the saltRounds

    // Insert the new user into the database
    const result = await client.query("INSERT INTO users (email, psw) VALUES($1, $2) RETURNING *", [email, hash]);

    const user = result.rows[0];
    if (result.rows && result.rows.length > 0) {
      req.login(user, (err) => {
        if (err) {
          debug('Error logging in user:', err);
          return res.redirect('/login');
        }
        res.redirect('/');
      });
    } else {
      debug("No valid ID returned from database");
      message = "Internal Server Error";
      return res.redirect(`/register?message=${message}`);
    }
  } catch (error) {
    debug("Error inserting data:", error);
    message = "Internal Server Error";
    return res.redirect(`/register?message=${message}`);
  } finally {
    // Release the database client
    if (client) {
      client.release();
    }
  }
});
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

app.get("/logout", (req, res) => {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect("/login");
  });
});



///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
app.get('/', compression(), (req, res) => {
  if (req.isAuthenticated()) {
    res.render('index.ejs');
  } else {
    res.redirect('/login');
  }
});

// Handle form submission logic for indexForm
app.post('/submitIndex', (req, res) => {
  const selectesOptionValue = req.body.cType;
  if(selectesOptionValue != undefined){
    res.redirect('/' +selectesOptionValue);
  }
});


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
app.get('/hotel', compression(), (req, res) => {
  res.render('hotel');
});

// Route for handling hotel form submission
app.post('/hotel', upload.array('hotelImages', 3), (req, res) => {
  // Get form data
  const { hTitle, hVat, hType, hPhone, hEmail, address, zipCode, description } = req.body;

  const keys = Object.keys(req.body);
  const hotelServices = [];
  const hotelSuppliers = [];

  keys.forEach(key => {
    if (["serviceTransfer", "serviceTour", "serviceRNC", "serviceBoat", "serviceHel", "serviceReservations", "serviceMiniMarket"].includes(key)) {
      hotelServices.push(key);
    }
    if (["haveTransfer", "haveTour", "haveRNC", "haveBoat", "haveHelic", "haveReserv", "haveProd"].includes(key)) {
      hotelSuppliers.push(key);
    }
  });

  // Processing the uploaded files
  const images = req.files.map(file => fs.readFileSync(file.path));

  try {
    // Insert data into the database
    pool.connect((err, client, release) => {
      if (err) {
        debug('Error acquiring client:', err);
        res.status(500).send('Internal Server Error');
        return;
      }

      client.query(
        "INSERT INTO customers (hotelName, hoteLVAT, hoteltType, hotelPhone, hotelEmail, hotelAddress, hotelZipCode, hotelWelMess, hotelServices, hotelSuppliers, photo1, photo2, photo3) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id",
        [
          hTitle, hVat, hType, hPhone, hEmail, address, zipCode, description, hotelServices, hotelSuppliers,
          Buffer.from(images[0] || ''), Buffer.from(images[1] || ''), Buffer.from(images[2] || '')
        ],
        (error, result) => {
          release(); // Release the client back to the pool
          if (error) {
            debug('Error inserting data:', error);
            res.status(500).send('Internal Server Error');
          } else {
            const hotelId = result.rows[0].id;
            res.redirect(`/everypay?hotelId=${hotelId}`);
          }
        }
      );
    });
  } catch (error) {
    debug('Error processing file:', error);
    res.status(500).send('Internal Server Error');
  }
});



///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
app.get('/transfer', compression(), (req, res) => {
  res.render('transfer');
});

// Route for handling form submission for transferSuplierForm
app.post('/transferSubmit', upload.single('tsLogo'), async (req, res) => {
  // Check if a file was uploaded
  if (!req.file) {
    return res.status(400).send('No file uploaded');
  }

  try {
    // Get file details from req.file
    const { originalname, mimetype, path } = req.file;
    // Read the uploaded file
    const imageData = fs.readFileSync(path);
    // Get form data
    const { tsTitle, tsVat, tsAEmail, tsNEmail, tsAddress, tsZipCode, tsPhone } = req.body;

    // Acquire a client from the pool
    const client = await pool.connect();

    try {
      const result = await client.query(
        "INSERT INTO transfer_suppliers (transferName, transferVAT, transferInvEmail, transferNotEmail, transferAddress, transferZipCode, transferPhone, transferLogo) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
        [tsTitle, tsVat, tsAEmail, tsNEmail, tsAddress, tsZipCode, tsPhone, Buffer.from(imageData)]
      );

      if (result.rows && result.rows.length > 0 && result.rows[0].id) {
        const transferSupplierId = result.rows[0].id;
        // Redirect to the '/transferPrices' route with the transferSupplierId as a query parameter
        res.redirect(`/transferPrices?transferSupplierId=${transferSupplierId}`);
      } else {
        debug("No valid ID returned from database");
        res.status(500).send("Internal Server Error");
      }
    } catch (error) {
      debug('Error inserting data:', error);
      res.status(500).send('Internal Server Error');
    } finally {
      // Release the client back to the pool
      client.release();
    }
  } catch (error) {
    debug('Error processing file:', error);
    res.status(500).send('Internal Server Error');
  }
});

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

app.get('/transferPrices', compression(), (req, res) => {
  const { transferSupplierId } = req.query;
  // Use transferSupplierId as needed
  res.render('transferPrices', { transferSupplierId });
});

// Route for handling form submission for transferPrices
app.post('/transferPrices', compression(), (req, res) => {
  // Extract values from req.body
  const { fromAddress, toAddress, vehicleType, dayPrice, nightPrice } = req.body;

  const { transferSupplierId } = req.query;

  // Insert values into the database
  pool.connect((err, client, release) => {
    if (err) {
      debug('Error acquiring client:', err);
      res.status(500).send('Internal Server Error');
      return;
    }

    client.query(
      "INSERT INTO transfer_prices (fromAddress, toAddress, vehicleType, dayPrice, nightPrice, transfer_supplier_id) VALUES ($1, $2, $3, $4, $5, $6)",
      [fromAddress, toAddress, vehicleType, dayPrice, nightPrice, transferSupplierId],
      (error, result) => {
        release(); // Release the client back to the pool
        if (error) {
          debug('Error inserting data:', error);
          res.status(500).send('Internal Server Error');
        } else {
          // Redirect to the '/everypay' route upon successful insert
          res.redirect(`/everypay?transferSupplierId=${transferSupplierId}`);
        }
      }
    );
  });
});

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

app.get('/tour', compression(), (req, res) => {
  res.render('tour');
});

// Route for handling form submission for tour
app.post('/tour', compression(), upload.single('tLogo'), (req, res) => {
  // Check if a file was uploaded
  if (!req.file) {
    return res.status(400).send('No file uploaded');
  }

  try {
    // Get file details from req.file
    const { originalname, mimetype, path } = req.file;
    // Read the uploaded file
    const imageData = fs.readFileSync(path);
    // Get form data
    const { tTitle, tVat, tNotEmail, tAcEmail, tAddress, tZipCode, tPhone } = req.body;

    // Insert data into the database
    pool.connect((err, client, release) => {
      if (err) {
        debug('Error acquiring client:', err);
        res.status(500).send('Internal Server Error');
        return;
      }

      client.query(
        "INSERT INTO tour_suppliers (tTitle, tVat, tNotEmail, tAcEmail, tAddress, tZipCode, tPhone , tLogo) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
        [tTitle, tVat, tNotEmail, tAcEmail, tAddress, tZipCode, tPhone, Buffer.from(imageData)],
        (error, result) => {
          release(); // Release the client back to the pool
          if (error) {
            debug('Error inserting data:', error);
            res.status(500).send('Internal Server Error');
          } else {
            const tourSupplierId = result.rows[0].id;
            res.redirect(`/tourPrices?tourSupplierId=${tourSupplierId}`);
          }
        }
      );
    });
  } catch (error) {
    debug('Error processing file:', error);
    res.status(500).send('Internal Server Error');
  }
});

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

app.get('/tourPrices', compression(), (req, res) => {
  const { tourSupplierId } = req.query;
  // Use tourSupplierId as needed
  res.render('tourPrices', { tourSupplierId });
});

// Route for handling form submission for tourPrices
app.post('/tourPrices', compression(), (req, res) => {
  const tourPrices = [];
  const { tourSupplierId } = req.query;

  // Iterate over form data keys to gather tour locations and prices
  Object.keys(req.body).forEach(key => {
    if(key.startsWith('price')) {
      tourPrices.push(req.body[key]);
    }
  });

  const chunkSize = 5;
  const chunks = [];
  for (let i = 0; i < tourPrices.length; i += chunkSize) {
    chunks.push(tourPrices.slice(i, i + chunkSize));
  }

  // Insert values into the database
  pool.connect((err, client, release) => {
    if (err) {
      debug('Error acquiring client:', err);
      res.status(500).send('Internal Server Error');
      return;
    }

    client.query(
      "INSERT INTO tour_prices (acropolis, sounio, delphi, epidauros, meteora, ifaistos, mykines, nafplio, olympia, tour_supplier_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id",
      [chunks[0], chunks[1], chunks[2], chunks[3], chunks[4], chunks[5], chunks[6], chunks[7], chunks[8], tourSupplierId],
      (error, result) => {
        release(); // Release the client back to the pool
        if (error) {
          debug('Error inserting data:', error);
          res.status(500).send('Internal Server Error');
        } else {
          // Redirect to the '/everypay' route with the tourSupplierId as a query parameter
          res.redirect(`/everypay?tourSupplierId=${tourSupplierId}`);
        }
      }
    );
  });
});


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

app.get('/rentacar', compression(), (req, res) => {
  res.render('rentacar');
});

// Route for handling form submission for rentacar
app.post('/rentacar', compression(), upload.single('rncLogo'), (req, res) => {
  // Check if a file was uploaded
  if (!req.file) {
    return res.status(400).send('No file uploaded');
  }

  try {
    // Get file details from req.file
    const { originalname, mimetype, path } = req.file;
    // Read the uploaded file
    const imageData = fs.readFileSync(path);
    // Get form data
    const { rncTitle, rncVat, rncNotEmail, rncEmail, rncAddress, rncZipCode, rncPhone } = req.body;

    // Insert data into the database
    pool.connect((err, client, release) => {
      if (err) {
        debug('Error acquiring client:', err);
        res.status(500).send('Internal Server Error');
        return;
      }

      client.query(
        "INSERT INTO rnc_suppliers (rncTitle, rncVat, rncNotEmail, rncEmail, rncAddress, rncZipCode, rncPhone, rncLogo) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
        [rncTitle, rncVat, rncNotEmail, rncEmail, rncAddress, rncZipCode, rncPhone, Buffer.from(imageData)],
        (error, result) => {
          release(); // Release the client back to the pool
          if (error) {
            debug('Error inserting data:', error);
            res.status(500).send('Internal Server Error');
          } else {
            const rncSupplierId = result.rows[0].id;
            res.redirect(`/rentacarPrices?rncSupplierId=${rncSupplierId}`);
          }
        }
      );
    });
  } catch (error) {
    debug('Error processing file:', error);
    res.status(500).send('Internal Server Error');
  }
});



///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
app.get('/rentacarPrices', compression(), (req, res) => {
  const { rncSupplierId } = req.query;
  // Use rncSupplierId as needed
  res.render('rentacarPrices', { rncSupplierId });
});

// Route for handling form submission for rentacarPrices
app.post('/rentacarPrices', compression(), (req, res) => {
  const rncPrices = [];
  const { rncSupplierId } = req.query;
  const formData = req.body;

  Object.keys(req.body).forEach(key => {
    if (key.match(/^row(\d+)-input\d+$/)) {
      rncPrices.push(req.body[key]);
    }
  });

  const chunkSize = 13;
  const chunks = [];
  for (let i = 0; i < rncPrices.length; i += chunkSize) {
    chunks.push(rncPrices.slice(i, i + chunkSize));
  }

  const numberOfRows = rncPrices.length / 13;

  // Extract values from inputs in the first column
  const inputsFromFirstColumn = [];
  for (const key in formData) {
    const match = key.match(/^row(\d+)-input1$/);
    if (match) {
      inputsFromFirstColumn.push(formData[key]);
    }
  }

  const encodedInputsFromFirstColumn = encodeURIComponent(JSON.stringify(inputsFromFirstColumn));

  // Acquire a client from the pool
  pool.connect((err, client, release) => {
    if (err) {
      debug('Error acquiring client:', err);
      res.status(500).send('Internal Server Error');
      return;
    }

    const queries = chunks.map((chunk, index) => {
      return new Promise((resolve, reject) => {
        client.query(
          "INSERT INTO rnc_prices (model, description, seats, doors, luggages, speed, cubic, fuel, ac, ageLimit, pricePerDay, fullCoverage, fullCoveragePlus, rnc_supplier_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)",
          [chunk[0], chunk[1], chunk[2], chunk[3], chunk[4], chunk[5], chunk[6], chunk[7], chunk[8], chunk[9], chunk[10], chunk[11], chunk[12], rncSupplierId],
          (error, result) => {
            if (error) {
              reject(error);
            } else {
              resolve(result);
            }
          }
        );
      });
    });

    Promise.all(queries)
      .then(() => {
        release(); // Release the client back to the pool
        res.redirect(`/rentacarPhotos?rncSupplierId=${rncSupplierId}&numberOfRows=${numberOfRows}&inputsFromFirstColumn=${encodedInputsFromFirstColumn}`);
      })
      .catch(error => {
        release(); // Release the client back to the pool
        debug('Error inserting data:', error);
        res.status(500).send('Internal Server Error');
      });
  });
});


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////



app.get('/rentacarPhotos', compression(), (req, res) => {
  const { rncSupplierId, numberOfRows, inputsFromFirstColumn } = req.query;

  if (!rncSupplierId || !numberOfRows || !inputsFromFirstColumn) {
    return res.status(400).send('rncSupplierId, numberOfRows, and inputsFromFirstColumn are required');
  }

  if (isNaN(numberOfRows) || numberOfRows <= 0) {
    return res.status(400).send('numberOfRows must be a positive number');
  }

  let carModels;
  try {
    carModels = JSON.parse(decodeURIComponent(inputsFromFirstColumn));
  } catch (e) {
    return res.status(400).send('inputsFromFirstColumn must be a valid JSON array');
  }

  while (carModels.length < numberOfRows) {
    carModels.push(`Car Model ${carModels.length + 1}`);
  }
  res.render('rentacarPhotos', { rncSupplierId, numberOfRows: parseInt(numberOfRows), carModels });
});


app.post('/rentacarPhotos', compression(), (req, res) => {
  const { rncSupplierId, numberOfRows, inputsFromFirstColumn } = req.query;

  // Define the uploadFields middleware function inside the route handler
  const uploadFields = (req, res, next) => {
    if (isNaN(numberOfRows)) {
      debug("Invalid numberOfRows value");
      return res.status(400).send("Invalid numberOfRows value");
    }

    const fields = [];
    for (let i = 0; i < numberOfRows; i++) {
      fields.push({ name: `photo1_${i}`, maxCount: 1 });
      fields.push({ name: `photo2_${i}`, maxCount: 1 });
      fields.push({ name: `photo3_${i}`, maxCount: 1 });
    }

    const uploadMiddleware = upload.fields(fields);
    uploadMiddleware(req, res, next);
  };

  // Use the uploadFields middleware
  uploadFields(req, res, async (err) => {
    if (err) {
      // Handle middleware error
      return res.status(500).send('Error handling file uploads');
    }

    // Continue with route handling logic after middleware
    // Access req.body and req.files here
    const numberOfRows = parseInt(req.body.numberOfRows, 10);

    // Access req.files to get uploaded files
    const uploadedFiles = req.files;

    // Acquire a client from the pool
    pool.connect(async (err, client, release) => {
      if (err) {
        debug('Error acquiring client:', err);
        res.status(500).send('Internal Server Error');
        return;
      }

      try {
        // Start a transaction
        await client.query('BEGIN');

        // Save images to the database
        for (let i = 0; i < numberOfRows; i++) {
          const photo1Data = uploadedFiles[`photo1_${i}`] ? uploadedFiles[`photo1_${i}`][0] : null;
          const photo2Data = uploadedFiles[`photo2_${i}`] ? uploadedFiles[`photo2_${i}`][0] : null;
          const photo3Data = uploadedFiles[`photo3_${i}`] ? uploadedFiles[`photo3_${i}`][0] : null;

          // Read image data from uploaded file
          const photo1 = photo1Data ? fs.readFileSync(photo1Data.path) : null;
          const photo2 = photo2Data ? fs.readFileSync(photo2Data.path) : null;
          const photo3 = photo3Data ? fs.readFileSync(photo3Data.path) : null;

          // Insert data into the database
          await client.query(
            `INSERT INTO rnc_photos (rnc_supplier_id, photo1, photo2, photo3) VALUES ($1, $2, $3, $4)`,
            [rncSupplierId, photo1, photo2, photo3]
          );
        }

        // Commit the transaction
        await client.query('COMMIT');

        // Send response
        res.redirect(`/everypay?rncSupplierId=${rncSupplierId}`);
      } catch (error) {
        // Rollback the transaction in case of an error
        await client.query('ROLLBACK');
        debug('Error inserting data:', error);
        res.status(500).send('Internal Server Error');
      } finally {
        release(); // Release the client back to the pool
      }
    });
  });
});


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

app.get('/boat', compression(), (req, res) => {

  res.render('boat');

});

app.post('/boat', compression(), upload.single('boatLogo'), (req, res) => {
  // Check if a file was uploaded
  if (!req.file) {
    return res.status(400).send('No file uploaded');
  }

  // Get file details from req.file
  const { originalname, mimetype, path } = req.file;
  // Read the uploaded file
  const imageData = fs.readFileSync(path);
  // Get form data
  const { boatTitle, boatVat, boatNotEmail, boatEmail, boatAddress, boatZipCode, boatPhone } = req.body;

  // Acquire a client from the pool
  pool.connect(async (err, client, release) => {
    if (err) {
      debug('Error acquiring client:', err);
      res.status(500).send('Internal Server Error');
      return;
    }

    try {
      // Insert data into the database
      const result = await client.query(
        "INSERT INTO boat_suppliers (boat_title, boat_vat, boat_notemail, boat_email, boat_address, boat_zipcode, boat_phone, boat_logo) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
        [boatTitle, boatVat, boatNotEmail, boatEmail, boatAddress, boatZipCode, boatPhone, Buffer.from(imageData)]
      );
      const boatSupplierId = result.rows[0].id;
      res.redirect(`/boatPrices?boatSupplierId=${boatSupplierId}`);
    } catch (error) {
      debug('Error inserting data:', error);
      res.status(500).send('Internal Server Error');
    } finally {
      release(); // Release the client back to the pool
    }
  });
});


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
app.get('/boatPrices', compression(), (req, res) => {

  const {boatSupplierId} = req.query;

  res.render('boatPrices', { boatSupplierId});


});


app.post('/boatPrices', compression(), (req, res) => {
  const boatPrices = [];
  const { boatSupplierId } = req.query;
  const formData = req.body;

  Object.keys(req.body).forEach(key => {
    if (key.match(/^b-row(\d+)-input\d+$/)) {
      boatPrices.push(req.body[key]);
    }
  });

  const chunkSize = 4;
  const chunks = [];
  for (let i = 0; i < boatPrices.length; i += chunkSize) {
    chunks.push(boatPrices.slice(i, i + chunkSize));
  }

  const numOfRows = boatPrices.length / 4;

  // Extract values from inputs in the first column
  const inputsColumn1 = [];
  for (const key in formData) {
    const match = key.match(/^b-row(\d+)-input1$/);
    if (match) {
      inputsColumn1.push(formData[key]);
    }
  }
  const encodedInputsColumn1 = encodeURIComponent(JSON.stringify(inputsColumn1));

  // Acquire a client from the pool
  pool.connect(async (err, client, release) => {
    if (err) {
      debug('Error acquiring client:', err);
      res.status(500).send('Internal Server Error');
      return;
    }

    try {
      for (let i = 0; i < numOfRows; i++) {
        await client.query(
          "INSERT INTO boat_prices (boat_name, boat_type, boat_price, boat_descr, boat_supplier_id) VALUES ($1, $2, $3, $4, $5)",
          [chunks[i][0], chunks[i][1], chunks[i][2], chunks[i][3], boatSupplierId]
        );
      }
      res.redirect(`/boatPhotos?boatSupplierId=${boatSupplierId}&numOfRows=${numOfRows}&inputsColumn1=${encodedInputsColumn1}`);
    } catch (error) {
      debug('Error inserting data:', error);
      res.status(500).send('Internal Server Error');
    } finally {
      release(); // Release the client back to the pool
    }
  });
});


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
app.get('/boatPhotos', compression(), (req, res) => {
  try {
    const { boatSupplierId, numOfRows, inputsColumn1 } = req.query;
    let boatModels;

    // Attempt to parse the input
    try {
      boatModels = JSON.parse(decodeURIComponent(inputsColumn1));
    } catch (e) {
      return res.status(400).send('Invalid input for inputsColumn1');
    }

    // Ensure boatModels is an array
    if (!Array.isArray(boatModels)) {
      return res.status(400).send('inputsColumn1 should be an array');
    }

    // Add default models if necessary
    while (boatModels.length < numOfRows) {
      boatModels.push(`Car Model ${boatModels.length + 1}`);
    }

    res.render('boatPhotos', { boatSupplierId, numOfRows, boatModels });

  } catch (err) {
    debug(err);
    res.status(500).send('Server Error');
  }
});

app.post('/boatPhotos', compression(), (req, res) => {
  const { boatSupplierId, numOfRows, inputsColumn1 } = req.query;

  // Define the uploadFields middleware function inside the route handler
  const uploadFields = (req, res, next) => {
    if (isNaN(numOfRows)) {
      debug("Invalid numberOfRows value");
      return res.status(400).send("Invalid numOfRows value");
    }

    const fields = [];
    for (let i = 0; i < numOfRows; i++) {
      fields.push({ name: `photo1_${i}`, maxCount: 1 });
      fields.push({ name: `photo2_${i}`, maxCount: 1 });
      fields.push({ name: `photo3_${i}`, maxCount: 1 });
    }

    const uploadMiddleware = upload.fields(fields);
    uploadMiddleware(req, res, next);
  };

  // Use the uploadFields middleware
  uploadFields(req, res, async (err) => {
    if (err) {
      // Handle middleware error
      return res.status(500).send('Error handling file uploads');
    }

    // Continue with route handling logic after middleware
    // Access req.body and req.files here
    const numOfRows = parseInt(req.body.numOfRows, 10);

    // Access req.files to get uploaded files
    const uploadedFiles = req.files;

    // Acquire a client from the pool
    pool.connect(async (err, client, release) => {
      if (err) {
        debug('Error acquiring client:', err);
        res.status(500).send('Internal Server Error');
        return;
      }

      try {
        // Start a transaction
        await client.query('BEGIN');

        // Save images to the database
        for (let i = 0; i < numOfRows; i++) {
          const photo1Data = uploadedFiles[`photo1_${i}`] ? uploadedFiles[`photo1_${i}`][0] : null;
          const photo2Data = uploadedFiles[`photo2_${i}`] ? uploadedFiles[`photo2_${i}`][0] : null;
          const photo3Data = uploadedFiles[`photo3_${i}`] ? uploadedFiles[`photo3_${i}`][0] : null;

          // Read image data from uploaded file
          const photo1 = photo1Data ? fs.readFileSync(photo1Data.path) : null;
          const photo2 = photo2Data ? fs.readFileSync(photo2Data.path) : null;
          const photo3 = photo3Data ? fs.readFileSync(photo3Data.path) : null;

          // Insert data into the database
          await client.query(
            `INSERT INTO boat_photos (boat_supplier_id, photo1, photo2, photo3) VALUES ($1, $2, $3, $4)`,
            [boatSupplierId, photo1, photo2, photo3]
          );
        }

        // Commit the transaction
        await client.query('COMMIT');

        // Send response
        res.redirect(`/everypay?boatSupplierId=${boatSupplierId}`);
      } catch (error) {
        // Rollback the transaction in case of an error
        await client.query('ROLLBACK');
        debug('Error inserting data:', error);
        res.status(500).send('Internal Server Error');
      } finally {
        release(); // Release the client back to the pool
      }
    });
  });
});

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
app.get('/reservation', compression(), (req, res) => {


  res.render('reservation');

});


app.post('/reservation', compression(), upload.array('resImages', 3), (req, res) => {

  const {
    resTitle, resURL, resVat, resPhone, resNotEmail, resEmail, resAddress, resZipCode, resCat, resMinCon, resPrice, resDescription, resOpen, resClose,
  } = req.body;

  const weekdays = {
    monday: req.body.monday ? true : false,
    tuesday: req.body.tuesday ? true : false,
    wednesday: req.body.wednesday ? true : false,
    thirsday: req.body.thirsday ? true : false,
    friday: req.body.friday ? true : false,
    suterday: req.body.suterday ? true : false,
    sunday: req.body.sunday ? true : false,
  };

  // Processing the uploaded files
  const images = req.files.map(file => fs.readFileSync(file.path));

  try {
    // Insert data into the database
    pool.connect((err, client, release) => {
      if (err) {
        debug('Error acquiring client:', err);
        res.status(500).send('Internal Server Error');
        return;
      }

      client.query(
        `INSERT INTO reservations (
          title, url, vat, phone, notification_email, billing_email, address, zip_code, category, 
          min_consumption, price_level, description, open_time, close_time, 
          monday, tuesday, wednesday, thirsday, friday, suterday, sunday, 
          image1, image2, image3
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24) RETURNING id`,
        [
          resTitle, resURL, resVat, resPhone, resNotEmail, resEmail, resAddress, resZipCode, resCat,
          resMinCon, resPrice, resDescription, resOpen, resClose,
          weekdays.monday, weekdays.tuesday, weekdays.wednesday, weekdays.thirsday, weekdays.friday, weekdays.suterday, weekdays.sunday,
          Buffer.from(images[0] || ''), Buffer.from(images[1] || ''), Buffer.from(images[2] || '')
        ],
        (error, result) => {
          release(); // Release the client back to the pool
          if (error) {
            debug('Error inserting data:', error);
            res.status(500).send('Internal Server Error');
          } else {
            const resSupplierId = result.rows[0].id;
            res.redirect(`/everypay?resSupplierId=${resSupplierId}`);
          }
        }
      );
    });
  } catch (error) {
    debug('Error processing file:', error);
    res.status(500).send('Internal Server Error');
  }
});

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Route for displaying the everypay form
app.get('/everypay', compression(), (req, res) => {
  // Extract hotelId and transferSupplierId from query parameters
  const { hotelId, transferSupplierId, tourSupplierId, rncSupplierId, boatSupplierId, resSupplierId } = req.query;

  // Render the everypay form and pass hotelId and transferSupplierId to the template
  res.render('everypay', { hotelId, transferSupplierId, tourSupplierId, rncSupplierId, boatSupplierId, resSupplierId});

});

//when user submit hotelForm
app.post('/everypay', compression(), (req, res) => {
  // Extract hotelId and transferSupplierId from query parameters
  const { hotelId, transferSupplierId, tourSupplierId, rncSupplierId, boatSupplierId, resSupplierId } = req.query;

  pool.connect((err, client, release) => {
    if (err) {
      debug("Error acquiring client:", err);
      res.status(500).send("Internal Server Error");
      return;
    }
    
    // Insert data into the everypay_table
    client.query(
      "INSERT INTO everypay_table (companyName, companyTile, companyDesc, companyEmail, companyVAT, companyPhone, companyAddress, companyZipCode, companyIBAN, companyNameIBAN, transfer_supplier_id, customer_id, tour_supplier_id, rnc_supplier_id, boat_supplier_id, res_supplier_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)",
      [req.body.cname, req.body.ctitle, req.body.description, req.body.email, req.body.vatNumber, req.body.phoneNumber, req.body.address, req.body.zipCode, req.body.ibanNumber, req.body.ibanName, transferSupplierId, hotelId, tourSupplierId, rncSupplierId, boatSupplierId, resSupplierId],
      (err, result) => {
        // Release the client back to the pool
        release();

        if (err) {
          debug("Error executing query:", err);
          res.status(500).send("Internal Server Error");
          return;
        }

        // Redirect to the '/final' route
        res.redirect('/final');
      }
    );
  });
});

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
app.get('/final', compression(), (req, res) => {
  // Retrieve image data from the database
  // pool.query('SELECT transferlogo FROM transfer_suppliers WHERE id = 7', (error, result) => {
  //   if (error) {
  //     debug("here");
  //     debug('Error fetching image from database:', error);
  //     // Handle the error, e.g., return an error response
  //     return res.status(500).send('Internal Server Error');
  //   }

  //   if (result.rows.length === 0) {
  //     // Handle case where no image is found, e.g., return a 404 response
  //     debug('Image not found');
  //     return res.status(404).send('Image not found');
  //   }

  //   // Extract the image data from the query result
  //   const imageData = result.rows[0].transferlogo;
  //   //debug(imageData);

  //   // Convert the image data to a Base64-encoded string
  //   const imageSrc = `data:image/jpeg;base64,${imageData.toString('base64')}`;

  //   // Render the final.ejs template, passing imageSrc as a variable
  //   res.render('final', { imageSrc });
  // });
  res.render('final');
});

passport.use(new LocalStrategy(
  {
    usernameField: 'loginEmail',
    passwordField: 'loginPsw',
  },
  async function (loginEmail, loginPsw, done) {
    let client;
    try {
      client = await pool.connect();
      const checkResult = await client.query('SELECT * FROM users WHERE email = $1', [loginEmail]);
      if (checkResult.rows.length > 0) {
        const user = checkResult.rows[0];
        const storedHashedPassword = user.psw;
        const isMatch = await bcrypt.compare(loginPsw, storedHashedPassword);
        if (isMatch) {
          return done(null, user);
        } else {
          return done(null, false, { message: 'Λάθος στοιχεία σύνδεσης.' });
        }
      } else {
        return done(null, false, { message: 'Δεν βρέθηκε ο χρήστης. Δοκιμάστε να κάνετε εγγραφή.' });
      }
    } catch (error) {
      debug('Error processing data:', error);
      return done(error);
    } finally {
      if (client) {
        client.release();
      }
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  let client;
  try {
    client = await pool.connect();
    const result = await client.query('SELECT * FROM users WHERE id = $1', [id]);
    if (result.rows.length > 0) {
      const user = result.rows[0];
      done(null, user);
    } else {
      done(new Error('User not found'));
    }
  } catch (error) {
    done(error);
  } finally {
    if (client) {
      client.release();
    }
  }
});



app.listen(port, () => {
  debug(`Server is running at http://localhost:${port}`);
});


