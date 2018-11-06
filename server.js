const express               = require('express');                   // Express web server framework
const request               = require('request');                   // For making http calls
const cors                  = require('cors');                      // Enable Cross-Origin Requests
const querystring           = require('querystring');               // Used for managing query strings (urls)
const cookieParser          = require('cookie-parser');             // Used for parsing cookies
const app                   = express();                            // Instantiate the web server
const stateKey              = 'spotify_auth_state';                 // Name used for state between spotify and the user
const SPOTIFY_CLIENT_ID     = process.env.SPOTIFY_CLIENT_ID;        // Spotify App client id
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;    // Sptofy App secret
const SPOTIFY_CALLBACK_URL  = process.env.SPOTIFY_CALLBACK_URL;     // Spotify redirect uri (after login)
const FRONTEND_CALLBACK_URL = process.env.FRONTEND_CALLBACK_URL;    // Frontend redirect uri

app.use(cors());                                            // Enable Cross-Origin middleware
app.use(cookieParser());                                    // Enable cookie middleware

/**
 * Generates a random string containing numbers and letters
 *
 */
function generateRandomString(length) {

    let text       = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (let i = 0; i < length; i++) {

        text += possible.charAt(Math.floor(Math.random() * possible.length));

    }

    return text;

}


//
// Handle /login web requests
//
app.get('/login', function (req, res) {

    const state = generateRandomString(16);

    res.cookie(stateKey, state);

    res.redirect('https://accounts.spotify.com/authorize?' +

                     querystring.stringify({

                                               response_type: 'code',
                                               client_id:     SPOTIFY_CLIENT_ID,
                                               scope:         'user-read-private user-read-email',
                                               redirect_uri:  SPOTIFY_CALLBACK_URL,
                                               state:         state

                                           }));

});

//
// Handle user requests after logging into spotify
//
app.get('/callback', function (req, res) {

    const code        = req.query.code || null;
    const state       = req.query.state || null;
    const storedState = req.cookies ? req.cookies[ stateKey ] : null;

    if (state === null || state !== storedState) {

        res.redirect('/#' +
                         querystring.stringify({
                                                   error: 'state_mismatch'
                                               }));
    } else {

        res.clearCookie(stateKey);

        const authOptions = {

            url: 'https://accounts.spotify.com/api/token',

            form: {

                code:         code,
                redirect_uri: SPOTIFY_CALLBACK_URL,
                grant_type:   'authorization_code'

            },

            headers: {

                'Authorization': 'Basic ' + (new Buffer(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET).toString('base64'))

            },

            json: true

        };

        //
        // Perform API call to spotify to get access_token (oAuth)
        //
        request.post(authOptions, function (error, response, body) {

            if (!error && response.statusCode === 200) {

                const access_token  = body.access_token;
                const refresh_token = body.refresh_token;

                const options = {

                    url:     'https://api.spotify.com/v1/me',
                    headers: { 'Authorization': 'Bearer ' + access_token },
                    json:    true

                };

                //
                // Perform API call to spotify to get user information
                //
                request.get(options, function (error, response, body) {

                    //
                    // Redirect the user back to the frontend application with user info/data
                    //
                    res.redirect(FRONTEND_CALLBACK_URL + '?' + querystring.stringify({
                                                                                         display_name:  body.display_name,
                                                                                         email:         body.email,
                                                                                         access_token:  access_token,
                                                                                         refresh_token: refresh_token

                                                                                     }));

                });


            } else {

                res.redirect(FRONTEND_CALLBACK_URL + '?error=' + querystring.stringify({ error: 'invalid_token' }));

            }

        });

    }

});

//
// Refresh (keep alive) the original login request
// This is called by the frontend application on occassion
//
app.get('/refresh_token', function (req, res) {

    // requesting access token from refresh token
    const authOptions = {

        url:     'https://accounts.spotify.com/api/token',
        headers: { 'Authorization': 'Basic ' + (Buffer.from(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET).toString('base64')) },
        form:    { grant_type: 'refresh_token', refresh_token: req.query.refresh_token },
        json:    true

    };

    request.post(authOptions, function (error, response, body) {

        if (!error && response.statusCode === 200) {

            //
            // Send back the new access_token (oAuth)
            //
            res.send({ 'access_token': body.access_token });

        }

    });

});

app.listen(process.env.PORT);

console.log('Application Server Started! Listening on port ' + process.env.PORT);
