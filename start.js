'use strict';

// Module imports
var GrovePi = require('node-grovepi').GrovePi
  , async = require('async')
  , dcl = require('./device-library.node')
  , Device = require('./device')
  , log = require('npmlog-ts')
  , bleacon = require('./lib/bleacon')
;

// IoTCS stuff
const GROVEPIDEV = "GrovePi+";
const BEACONDEV  = "Beacon";
dcl = dcl({debug: false});
var storePassword = 'Welcome1';
const DHTSENSOR       = "urn:com:oracle:ccasares:iot:device:grovepi:sensors:dht";
const LIGHTSENSOR     = "urn:com:oracle:ccasares:iot:device:grovepi:sensors:light";
const MOTIONSENSOR    = "urn:com:oracle:ccasares:iot:device:grovepi:sensors:motion";
const PROXIMITYSENSOR = "urn:com:oracle:ccasares:iot:device:grovepi:sensors:proximity";
const SOUNDSENSOR     = "urn:com:oracle:ccasares:iot:device:grovepi:sensors:sound";
const BEACONURN       = "urn:com:oracle:iot:device:estimote:beacon";
var urnGrovepi = [
     DHTSENSOR
   , LIGHTSENSOR
   , MOTIONSENSOR
   , PROXIMITYSENSOR
   , SOUNDSENSOR
];
var urnBeacon = [ BEACONURN ];
var grovepi = new Device(GROVEPIDEV);
var beacon  = new Device(BEACONDEV);
const storeFileGrovepi = process.argv[2];
const storeFileBeacon  = process.argv[3];
var devices = [ grovepi, beacon ];

// Init Devices
grovepi.setStoreFile(storeFileGrovepi, storePassword);
grovepi.setUrn(urn);
beacon.setStoreFile(storeFileBeacon, storePassword);
beacon.setUrn(urn);

// GrovePi stuff
var board = undefined;

// Beacons stuff
var Bleacon = new bleacon();

// Misc
const PROCESS = 'PROCESS';
const IOTCS   = 'IOTCS';
const GROVEPI = 'GROVEPI';
const BEACON  = 'BEACON';
log.level ='verbose';
log.timestamp = true;

function getModel(device, urn, callback) {
  device.getDeviceModel(urn, function (response, error) {
    if (error) {
      callback(error);
    }
    callback(null, response);
  });
}

// Detect CTRL-C
process.on('SIGINT', function() {
  log.info(PROCESS, "Caught interrupt signal");
  log.info(PROCESS, "Exiting gracefully");
  if (board) board.close()
  board = undefined;
  process.removeAllListeners()
  if (typeof err != 'undefined')
    log.error(PROCESS, err)
  process.exit(2);
});

async.series( {
  iot: function(callbackMainSeries) {
    log.info(IOTCS, "Initializing IoTCS devices");
    log.info(IOTCS, "Using IoTCS JavaScript Libraries v" + dcl.version);
    async.eachSeries( devices, function(d, callbackEachSeries) {
      async.series( [
        function(callbackSeries) {
          // Initialize Device
          log.info(IOTCS, "Initializing IoT device '" + d.getName() + "'");
          d.setIotDcd(new dcl.device.DirectlyConnectedDevice(d.getIotStoreFile(), d.getIotStorePassword()));
          callbackSeries(null);
        },
        function(callbackSeries) {
          // Check if already activated. If not, activate it
          if (!d.getIotDcd().isActivated()) {
            log.verbose(IOTCS, "Activating IoT device '" + d.getName() + "'");
            d.getIotDcd().activate(d.getUrn(), function (device, error) {
              if (error) {
                log.error(IOTCS, "Error in activating '" + d.getName() + "' device (" + d.getUrn() + "). Error: " + error.message);
                callbackSeries(error);
              }
              d.setIotDcd(device);
              if (!d.getIotDcd().isActivated()) {
                log.error(IOTCS, "Device '" + d.getName() + "' successfully activated, but not marked as Active (?). Aborting.");
                callbackSeries("ERROR: Successfully activated but not marked as Active");
              }
              callbackSeries(null);
            });
          } else {
            log.verbose(IOTCS, "'" + d.getName() + "' device is already activated");
            callbackSeries(null);
          }
        },
        function(callbackSeries) {
          // When here, the device should be activated. Get device models, one per URN registered
          async.eachSeries(d.getUrn(), function(urn, callbackEachSeriesUrn) {
            getModel(d.getIotDcd(), urn, (function (error, model) {
              if (error !== null) {
                log.error(IOTCS, "Error in retrieving '" + urn + "' model. Error: " + error.message);
                callbackEachSeriesUrn(error);
              } else {
                d.setIotVd(urn, model, d.getIotDcd().createVirtualDevice(d.getIotDcd().getEndpointId(), model));
                log.verbose(IOTCS, "'" + urn + "' intialized successfully");
              }
              callbackEachSeriesUrn(null);
            }).bind(this));
          }, function(err) {
            if (err) {
              callbackSeries(err);
            } else {
              callbackSeries(null, true);
            }
          });
        }
      ], function(err, results) {
        callbackEachSeries(err);
      });
    }, function(err) {
      if (err) {
        callbackMainSeries(err);
      } else {
        log.info(IOTCS, "IoTCS device initialized successfully");
        callbackMainSeries(null, true);
      }
    });
  },
  grovepi: function(callbackMainSeries) {
    log.info(GROVEPI, "Initializing GrovePi devices");
    if (board)
      callbackMainSeries(null, true);
    log.info(GROVEPI, 'Starting Board setup');
    board = new GrovePi.board({
      debug: true,
      onError: function(err) {
        log.error(GROVEPI, 'TEST ERROR');
        log.error(GROVEPI, err);
      },
      onInit: function(res) {
        if (res) {
          var dhtSensor = new GrovePi.sensors.DHTDigital(3, GrovePi.sensors.DHTDigital.VERSION.DHT11, GrovePi.sensors.DHTDigital.CELSIUS)
          log.info(GROVEPI, 'GrovePi Version :: ' + board.version());
          // DHT Sensor
          log.info(GROVEPI, 'DHT Digital Sensor (start watch)');
          dhtSensor.on('change', function(res) {
            if ( res.length == 3) {
              var data = { temperature: res[0], humidity: res[1] }
              log.verbose(GROVEPI, 'DHT onChange value = ' + JSON.stringify(data));
              var vd = grovepi.getIotVd(DHTSENSOR);
              if (vd) {
                vd.update(data);
              } else {
                log.error(IOTCS, "URN not registered: " + DHTSENSOR);
              }
            } else {
              log.warn(GROVEPI, "DHT Digital Sensor: Invalid value read: " + res);
            }
          })
          dhtSensor.watch(500) // milliseconds
          log.info(GROVEPI, "GrovePi devices initialized successfully");
        } else {
          log.error(GROVEPI, 'TEST CANNOT START')
        }
      }
    })
    board.init()
    callbackMainSeries(null, true);
  },
  beacons: function(callbackMainSeries) {
    log.info(BEACON, "Initializing Beacons");
    Bleacon.on('discover', function(b) {
      log.verbose(BEACON, 'Beacon found: ' + JSON.stringify(b));
    });
    log.verbose(BEACON, "Start scanning...");
    Bleacon.startScanning();
    callbackMainSeries(null, true);
  }
}, function(err, results) {
  if (err) {
  } else {
    log.info(PROCESS, 'Initialization completed');
  }
});
