import { Component, NgZone } from '@angular/core';
import { NavController } from 'ionic-angular';
import { ToastController } from 'ionic-angular';
import { BLE } from '@ionic-native/ble';


const SENSORTAG_TEMP_SERVICE = 'f000aa20-0451-4000-b000-000000000000';
const SENSORTAG_TEMP_CHARACTERISTIC = 'f000aa21-0451-4000-b000-000000000000';
const SENSORTAG_TEMP_CONF_CHARACTERISTIC = 'f000aa22-0451-4000-b000-000000000000';
const SENSORTAG_DEVICE_NAME = 'CC2650 SensorTag';


// interface DeviceObject {
//   device: any;
// }


@Component({
  selector: 'page-home',
  templateUrl: 'home.html'
})
export class HomePage {

  scanStarted = false;
  devices = [];
  statusMessage: string;

  constructor(public navCtrl: NavController,
              private ngZone: NgZone, 
              private toastCtrl: ToastController, 
              private ble: BLE) {

  }

  startScan() {
    this.devices = [];
    this.scanStarted = true;

    this.ble.startScan([]).subscribe(
      device => this.onDeviceDiscovered(device), 
      error => this.onScanError(error)
    );

    this.setStatus('Scanning started...');
  }

  stopScan() {
    this.ble.stopScan().then(() => {
      this.scanStarted = false;
      this.setStatus('Scanning stopped.');
    });
  }

  scanStartOrStop() {
    if (this.scanStarted) {
      this.stopScan();
    } else {
      this.startScan();
    }
  }

  onDeviceDiscovered(device) {
    console.log('Discovered ' + JSON.stringify(device, null, 2));

    if (device.name == SENSORTAG_DEVICE_NAME) {
      this.ble.connect(device.id).subscribe(
        peripheralData => {
          this.onConnected(peripheralData);
        }, 
        peripheralData => {
          console.log((peripheralData.name || peripheralData.id) + ' disconnected.');
        }
      );
    }
  }

  onConnected(peripheralData) {
    this.setStatus('Connected to ' + (peripheralData.name || peripheralData.id));
    //console.log('Peripheral informations: ' + JSON.stringify(peripheralData, null, 2));

    var deviceData = {
      name: peripheralData.name,
      id: peripheralData.id,
      temperature: 0.0,
      humidity: 0.0
    };
    
    if (this.devices.find(device => device.id == peripheralData.id) == undefined) {
      //TODO: Index anhängen, da mehrere Sensortags vorhanden sein können -> 'uniqueName' als property setzen

      this.ngZone.run(() => {
        this.devices.push(deviceData);
      });

      //activate notifications
      var data = new Uint8Array(1);
      data[0] = 1;
      this.ble.write(deviceData.id, SENSORTAG_TEMP_SERVICE, SENSORTAG_TEMP_CONF_CHARACTERISTIC, data.buffer)
      .then(
        () => this.onInitialConfigFinished(deviceData)
      ).catch(
        err => console.log('Error on writing to config characteristic(' + err.toString() + ')')
      );
    }
  }

  onInitialConfigFinished(deviceData) {
    this.ble.startNotification(deviceData.id, SENSORTAG_TEMP_SERVICE, SENSORTAG_TEMP_CHARACTERISTIC).subscribe(
      buffer => {
        var sensorData = new Uint16Array(buffer);
        var rawTemp = sensorData[0];
        var rawHum = sensorData[1];
        var temp = (rawTemp / 65536)*165 - 40;
        //rawHum &= ~0x0003;
        var hum = (rawHum / 65536)*100;
        
        this.ngZone.run(() => {
          deviceData.temperature = temp.toFixed(2);
          deviceData.humidity = hum.toFixed(2);
        });
        //console.log('Temp.: ' + deviceData.temperature + ' °C -- Hum.: ' + deviceData.humidity + ' %');
      },
      () => console.log('Unexpected Error: Failed to subscribe for temperature changes.')
    );
  }

  onScanError(error) {
    this.scanStarted = false;
    this.setStatus('Error ' + error);
    let toast = this.toastCtrl.create({
      message: 'Error scanning for Bluetooth low energy devices.',
      position: 'middle',
      duration: 2000
    });
    toast.present();
  }

  setStatus(message) {
    console.log(message);
    this.statusMessage = message;
  }

  onDeviceSelected(device : string) {

  }

  //TODO: benötigt?
  ionViewWillLeave() {
    console.log('ionViewWillLeave disconnecting Bluetooth');
    for (var device of this.devices) {
      this.ble.disconnect(device.id).then(
        () => console.log('Disconnected ' + JSON.stringify(device.name)),
        () => console.log('ERROR disconnecting ' + JSON.stringify(device.name))
      );
    }
    this.devices = [];
  }

}
