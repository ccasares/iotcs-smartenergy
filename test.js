var bleacon = require('./lib/bleacon');
var Bleacon = new bleacon();

Bleacon.on('discover', function(b) {
  console.log('Beacon found: ' + JSON.stringify(b));
});

Bleacon.startScanning();
