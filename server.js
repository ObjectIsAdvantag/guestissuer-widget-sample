//
// Copyright (c) 2018 Cisco Systems
// Licensed under the MIT License 
//

/*
 * a Webex Teams App based on Node.js
 * that implements the Webex Permanent Guest Issuer flow, to retreive an API access tokens.
 * 
 * See documentation: https://developer.webex.com/guest-issuer.html
 * 
 */

// Load environment variables from project .env file
require('node-env-file')(__dirname + '/.env');

var debug = require("debug")("lab");
var fine = require("debug")("lab:fine");

var request = require("request");
var express = require('express');
var app = express();




//
// Step 0: create a Guest Issuer Application from https://developer.webex.com/add-guest.html 
//   - then fill in your Guest Isser App properties below
//
var guestId = process.env.GUEST_ISSUER || "Y2lzY29zcGFyazovL3VzL09SR0FOSVpBVElPTi9jMGU0OWU3NS1lMGYwLTRjY2QtOWMzZi04OWE0YTQ2ZDM1ODA";
var guestSecret = process.env.GUEST_SECRET || "Okr7JOG8xvTuMbU+xVm/0vyXLMJod59ZTamKBYZ98KY=";


//
// Step 1: generate the home page
//
var read = require("fs").readFileSync;
var join = require("path").join;
var str = read(join(__dirname, '/www/index.ejs'), 'utf8');
var ejs = require("ejs");
var compiled = ejs.compile(str)({ "toPersonEmail": "stsfartz@cisco.com" }); // inject values into the template
app.get("/index.html", function (req, res) {
    debug("serving the home page (generated from an EJS template)");
    res.send(compiled);
});
app.get("/", function (req, res) {
    res.redirect("/index.html");
});
// -------------------------------------------------------------
// Statically serve the "/www" directory
// WARNING: Do not move the 2 lines of code below, as we need this exact precedance order for the static and dynamic HTML generation to work correctly all together
//          If the section above is commented, the static index.html page will be served instead of the EJS template.
var path = require('path');
app.use("/", express.static(path.join(__dirname, 'www')));


//
// Step 2: process the form submission
//     - generate a JWT Guest token (for the user data)
//     - fetch an access token from Webex cloud
//     - and show the widget space 
//
app.get("/submit", function (req, res) {
    debug("form submission callback hit");

    // Check all fields are filled
    if (!req.query.username) {
        debug("incorrect form: name is missing");
        res.send("<h1>App sample could not complete</h1><p>Please add a user name.</p>");
        return;
    }
    if (!req.query.userid) {
        debug("incorrect form: identifier is missing");
        res.send("<h1>App sample could not complete</h1><p>Please add an identifier.</p>");
        return;
    }
    if (!req.query.toPerson) {
        debug("incorrect form: toPerson is missing");
        res.send("<h1>App sample could not complete</h1><p>Please add a toPerson email.</p>");
        return;
    }

    // Create the JWT Guest token
    try {
        // Expires in 30 seconds by default
        let delay = process.env.JWT_EXPIRES || 30;
        const expiresInSeconds = Math.round(Date.now() / 1000) + delay;

        const jwt = require('jsonwebtoken');
        const guestToken = jwt.sign(
            {
                sub: req.query.userid,
                name: req.query.username,
                iss: guestId,
                exp: expiresInSeconds
            },
            Buffer.from(guestSecret, 'base64'),
            {
                algorithm: 'HS256',
                noTimestamp: true
            });
        debug("successfully built JWT Guest token:" + guestToken);
        //debug("successfully built JWT Guest token:" + guestToken.substring(0, 30));

        // Fetch an access token
        const axios = require('axios');
        axios.post('https://api.ciscospark.com/v1/jwt/login', '',
            { headers: { 'Authorization': 'Bearer ' + guestToken } })
            .then(response => {
                if (!response.data || !response.data.token) {
                    debug("no token found in response: " + response);
                    res.send("<h1>App sample could not complete</h1><p>Could not contact Webex Teams API to fetch an access token.</p>");
                    return;
                }

                const accessToken = response.data.token;
                debug(`Fetched access token, valid for: ${response.data.expiresIn} seconds\n${accessToken}`);

                // Display Space Widget
                try {
                    const read = require("fs").readFileSync;
                    const join = require("path").join;
                    const template = read(join(__dirname, './www/widget.ejs'), 'utf8');
                    var widget = require("ejs").compile(template)({
                        "username": req.query.username,
                        "token": accessToken,
                        "email": req.query.toPerson
                    });
                    res.send(widget);
                    return;
                }
                catch (err) {
                    debug("error compiling the template:" + err.message);
                    res.send("<h1>App sample could not complete</h1><p>error compiling the template.</p>");
                    return;
                }
            })
            .catch(err => {
                switch (err.code) {
                    case 'ENOTFOUND':
                        debug("could not contact the Webex API");
                        break
                    default:
                        debug("error accessing /jwt/login, err: " + err.message);

                        if (err.response && (err.response.status >= 400) && (err.response.status < 500)) {
                            debug(`Invalid Guest token: ${err.response.data.message}`);

                            if (err.response.status == 401) {
                                res.send("<h1>App sample could not complete</h1><p>Invalid guest issuer secret</p>");
                                return;
                            }

                            if (err.response.status == 404) {
                                res.send("<h1>App sample could not complete</h1><p>Invalid guest issuer identifier</p>");
                                return;
                            }
                        }
                        break;
                }

                res.send("<h1>App sample could not complete</h1><p>failed to generate an access token.</p>");
                return;
            })
    }
    catch (err) {
        debug("failed to generate a Guest token");
        res.send("<h1>App sample could not complete</h1><p>Failed generating the JWT token.</p>");
        return;
    }
});


// Starts the Web App
var port = process.env.PORT || 8080;
app.listen(port, function () {
    console.log("Webex Guest Issuer app started on port: " + port);
});
