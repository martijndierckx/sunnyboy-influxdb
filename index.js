// CONFIG
var sma = {
	host: 'SMA IP',
	password: 'PASSWORD'
};
var influxDb = {
	host: 'INFLUX IP',
	port: 8086,
	/*username: 'USER',
	password: 'PASSWORD',*/
	db: 'home',
	keys: {
		DC: {
			A: {
				watt: 'DC_Watt_A',
				volt: 'DC_Volt_A',
				amp: 'DC_Amps_A'
			},
			B: {
				watt: 'DC_Watt_B',
				volt: 'DC_Volt_B',
				amp: 'DC_Amps_B'
			}
		},
		AC: {
			watt: 'AC_Watt',
			frequency: 'AC_net_Frequency',
			L1: {
				volt: 'AC_Volt_L1',
				amp: 'AC_Amps_L1'
			},
			L2: {
				volt: 'AC_Volt_L2',
				amp: 'AC_Amps_L2'
			},
			L3: {
				volt: 'AC_Volt_L3',
				amp: 'AC_Amps_L3'
			},
			L1L2: {
				volt: 'AC_Volt_L1L2',
			},
			L2L3: {
				volt: 'AC_Volt_L2L3',
			},
			L3L1: {
				volt: 'AC_Volt_L3L1',
			}
		},
		dayYield: {
			kwh: 'day_yield',
			eur: 'day_yield_eur'
		},
		totalYield: {
			kwh: 'total_yield'
		}
	}
};
const pricePerKwh = 0.24;
const waitIfZero = 60; // Wait 60 seconds if the last values were 0
const getValuesInterval = 1; // Store values every second
const getMidnightYieldInterval = 3; // Store values every 3 hours
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // Ignore bad SSL


// ---- POTEN AF VANAF HIER ----- //
// ------------------------------ //


// Imports
const request = require('request');
const Influx = require('influx');
const moment = require('moment');
const onDeath = require('death');


// Globals
sma.sid = null;
sma.reqHeaders = {
	'Content-Type': 'application/x-www-form-urlencoded',
	'Accept': 'application/json, text/plain, */*',
	'Content-Type': 'application/json;charset=UTF-8',
	'Origin': 'https://'+ sma.host
};
var latestValues = {
	values: null,
	timestamp: null
};
var midnightTotalYield = {
	yield: null,
	timestamp : null
};


// Influx Globals
const influxFieldTypes = {};
function setInfluxFieldTypes(keys) {
	for(var key in keys) {
		var keyName = keys[key];
		if(typeof keyName === 'object') {
			setInfluxFieldTypes(keyName);
		}
		else {
			influxFieldTypes[keyName] = Influx.FieldType.FLOAT;
		}
	}
}
setInfluxFieldTypes(influxDb.keys);

const influx = new Influx.InfluxDB({
	host: influxDb.host,
	port: influxDb.port,
	username: influxDb.username,
	password: influxDb.password,
	database: influxDb.db,
	schema: [{
		measurement: 'SMA_values',
		fields: influxFieldTypes,
		tags: [ 'host' ]
	}]
});



// Login = Get Session ID
var getSMASessionId = function(callback) {
	var options = {
		url: 'https://'+ sma.host + '/dyn/login.json',
		method: 'POST',
		headers: sma.reqHeaders,
		body: '{"right":"istl","pass":"'+ sma.password +'"}',
		gzip: true
	};

	request(options, function (error, response, body) {
		if (!error && response.statusCode == 200) {
			try {
				// Save Session ID 
				var jsonResp = JSON.parse(body);
				sma.sid = jsonResp.result.sid;

				console.log('Got SMA Session ID: '+ sma.sid);

				// Callback
				if(callback !== null) {
					callback();
				}
			}
			catch(e) {
				console.error('Error when parsing SMA SID response');
				console.log(body);
			}
		}
	});
};


// Get total yield up till midnight
var getMidnightYield = function() {
	var date = moment().utc().startOf('day').subtract(3, 'days');

	var options = {
		url: 'https://'+ sma.host + '/dyn/getLogger.json?sid='+ sma.sid,
		method: 'POST',
		headers: sma.reqHeaders,
		body: '{"destDev":[],"key":28704,"tStart":'+ date.unix() +',"tEnd":'+ date.clone().add(2, 'days').unix() +'}',
		gzip: true
	};

	request(options, function (error, response, body) {
		if (!error && response.statusCode == 200) {
			var jsonResp = null;

			try {
				jsonResp = JSON.parse(body);
			}
			catch(e) {
				console.log(e);
			}

			if(jsonResp !== null && jsonResp.result !== undefined) {
				// Get Main Key
				var mainKey = Object.keys(jsonResp.result)[0];

				// Save yield & timestamp
				midnightTotalYield.yield = jsonResp.result[mainKey][2] === undefined ? 0 : jsonResp.result[mainKey][2].v;
				midnightTotalYield.timestamp = date.unix();

				console.log('Total yield up till midnight: '+ midnightTotalYield.yield);
			}
			else {
				console.log('Unexpected response');
			}
		}
	});
};


// Get Values
var getValues = function(callback, skipTryAgain) {
	var options = {
		url: 'https://'+ sma.host + '/dyn/getAllOnlValues.json?sid='+ sma.sid,
		method: 'POST',
		headers: sma.reqHeaders,
		body: '{"destDev":[]}',
		gzip: true
	};

	request(options, function (error, response, body) {
		if (!error && response.statusCode == 200) {
			var jsonResp = null;

			try {
				jsonResp = JSON.parse(body);
			}
			catch(e) {
				console.log(e);
			}

			// Session ID still OK?
			if(jsonResp !== null && jsonResp.err !== undefined) {
				// Was there a previous failed attempt?
				if(skipTryAgain != true) {
					// Get new Session ID
					getSMASessionId(function() {
						// Try again
						getValues(callback, true);
					});
				}
				else {
					console.log('Second failed attempt');
				}
			}
			else if(midnightTotalYield.timestamp != moment().utc().startOf('day').subtract(3, 'days').unix()) {
				getMidnightYield();
			}
			else if(jsonResp !== null && jsonResp.result !== undefined) {
				// Get Main Key
				var mainKey = Object.keys(jsonResp.result)[0];

				// Day Yield
				var dayYield = null;
				if(jsonResp.result[mainKey]['6400_00262200'] !== undefined) { // Old way
					dayYield = jsonResp.result[mainKey]['6400_00262200'][1][0].val / 1000;
				}
				else if(midnightTotalYield.yield !== null) { // New way
					dayYield = (jsonResp.result[mainKey]['6400_00260100'][1][0].val - midnightTotalYield.yield) / 1000;
				}
				else {
					dayYield = 0;
				}

				// Read and Clean values
				var values = {
					DC: {
						A: {
							watt: jsonResp.result[mainKey]['6380_40251E00'][1][0].val == null ? 0 : jsonResp.result[mainKey]['6380_40251E00'][1][0].val,
							volt: jsonResp.result[mainKey]['6380_40451F00'][1][0].val == null ? 0 : jsonResp.result[mainKey]['6380_40451F00'][1][0].val / 100,
							amp: jsonResp.result[mainKey]['6380_40452100'][1][0].val == null ? 0 : jsonResp.result[mainKey]['6380_40452100'][1][0].val / 1000
						},
						B: {
							watt: jsonResp.result[mainKey]['6380_40251E00'][1][1].val == null ? 0 : jsonResp.result[mainKey]['6380_40251E00'][1][1].val,
							volt: jsonResp.result[mainKey]['6380_40451F00'][1][1].val == null ? 0 : jsonResp.result[mainKey]['6380_40451F00'][1][1].val / 100,
							amp: jsonResp.result[mainKey]['6380_40452100'][1][1].val == null ? 0 : jsonResp.result[mainKey]['6380_40452100'][1][1].val / 1000
						}
					},
					AC: {
						watt: jsonResp.result[mainKey]['6100_40263F00'][1][0].val == null ? 0 : jsonResp.result[mainKey]['6100_40263F00'][1][0].val,
						frequency: jsonResp.result[mainKey]['6100_00465700'][1][0].val == null ? 0 : jsonResp.result[mainKey]['6100_00465700'][1][0].val / 100,
						L1: {
							volt: jsonResp.result[mainKey]['6100_00464800'][1][0].val == null ? 0 : jsonResp.result[mainKey]['6100_00464800'][1][0].val / 100,
							amp: jsonResp.result[mainKey]['6100_40465300'][1][0].val == null ? 0 : jsonResp.result[mainKey]['6100_40465300'][1][0].val / 1000
						},
						L2: {
							volt: jsonResp.result[mainKey]['6100_00464900'][1][0].val == null ? 0 : jsonResp.result[mainKey]['6100_00464900'][1][0].val / 100,
							amp: jsonResp.result[mainKey]['6100_40465400'][1][0].val == null ? 0 : jsonResp.result[mainKey]['6100_40465400'][1][0].val / 1000
						},
						L3: {
							volt: jsonResp.result[mainKey]['6100_00464A00'][1][0].val == null ? 0 : jsonResp.result[mainKey]['6100_00464A00'][1][0].val / 100,
							amp: jsonResp.result[mainKey]['6100_40465500'][1][0].val == null ? 0 : jsonResp.result[mainKey]['6100_40465500'][1][0].val / 1000
						},
						L1L2: {
							volt: jsonResp.result[mainKey]['6100_00464B00'][1][0].val == null ? 0 : jsonResp.result[mainKey]['6100_00464B00'][1][0].val / 100,
						},
						L2L3: {
							volt: jsonResp.result[mainKey]['6100_00464C00'][1][0].val == null ? 0 : jsonResp.result[mainKey]['6100_00464C00'][1][0].val / 100,
						},
						L3L1: {
							volt: jsonResp.result[mainKey]['6100_00464D00'][1][0].val == null ? 0 : jsonResp.result[mainKey]['6100_00464D00'][1][0].val / 100,
						}
					},
					dayYield: {
						kwh: dayYield,
						eur: dayYield === null ? null : dayYield * pricePerKwh
					},
					totalYield: {
						kwh: jsonResp.result[mainKey]['6400_00260100'][1][0].val == null ? 0 : jsonResp.result[mainKey]['6400_00260100'][1][0].val / 1000
					}
				}

				callback(values);
			}
			else {
				console.log('Unexpected response');
			}
		}
	});
};


// Store Values
var storeValues = function(values) {
	// Key value pairs
	var keyValues = {};
	function combineKeyValues(keys, values) {
		for(var key in keys) {
			var keyName = keys[key];
			if(typeof keyName === 'object') {
				combineKeyValues(keyName, values[key]);
			}
			else {
				keyValues[keyName] = values[key];
			}
		}
	}
	combineKeyValues(influxDb.keys, values);

	// Write
	influx.writePoints([
	{
		measurement: 'Solar',
		tags: { host: 'SMA' },
		fields: keyValues,
	}
	]).catch(err => {
		console.error(`Error saving data to InfluxDB! ${err.stack}`)
    });
};


// Get Values every X seconds
setInterval(function() {
	// Were latest values 0, wait X seconds
	var timeSinceLastValues = moment().diff(latestValues.timestamp, 'seconds');
	if(latestValues.values == null || (latestValues.values.DC.A.volt != 0 || latestValues.values.DC.B.volt != 0) || (latestValues.values.DC.A.volt == 0 && latestValues.values.DC.B.volt == 0 && timeSinceLastValues >= 60)) {
		// Get values
		getValues(function(values) {
			// Log Values
			console.log('New values at '+ moment().format('DD/MM/YYYY HH:mm:ss'));
			console.log(values);

			// Store locally
			latestValues.values = values;
			latestValues.timestamp = moment();

			// Store Values in InfluxDB
			storeValues(values);
		});
	}
	else {
		console.log('Waiting 60 seconds because previous values where 0');
	}
}, getValuesInterval * 1000);


// Kill session on exit
var offDeath = onDeath(function(signal, err) {
	console.log('Killing SMA session '+ sma.sid);

	var options = {
		url: 'https://'+ sma.host + '/dyn/logout.json?sid='+ sma.sid,
		method: 'POST',
		headers: sma.reqHeaders,
		body: '{}',
		gzip: true
	};
	request(options, function (error, response, body) {
		console.log('Killed SMA session '+ sma.sid);
	});

	setTimeout(function(){}, 1000); // Wait for the async logout request

	offDeath();
	process.exit(1);
});