import { Component } from '@angular/core';
import { NavController } from 'ionic-angular';
import { ToastController } from 'ionic-angular';
import { BLE } from '@ionic-native/ble';


const SENSORTAG_TEMP_SERVICE = 'A002';
const SENSORTAG_TEMP_CHARACTERISTIC = 'A005';


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
              private toastCtrl: ToastController, 
              private ble: BLE) {

  }

  startScan() {
    this.devices = [];
    this.scanStarted = true;

    this.ble.startScan([SENSORTAG_TEMP_SERVICE]).subscribe(
      device => this.onDeviceDiscovered(device), 
      error => this.onScanError(error)
    );

    this.setStatus('Scanning started...');
  }

  stopScan() {
    this.ble.stopScan().then(() => {
      this.scanStarted = false;
      this.ble.stopScan().then(
        () => this.setStatus('Scanning stopped.')
      );
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
    this.ble.connect(device.id).subscribe(
      peripheralData => {
        this.onConnected(peripheralData);
      }, 
      peripheralData => {
        console.log((peripheralData.name || peripheralData.id) + ' disconnected.');
      }
    );
  }

  onConnected(peripheralData) {
    this.setStatus('Connected to ' + (peripheralData.name || peripheralData.id));

    var deviceData = {
      name: peripheralData.name,
      id: peripheralData.id,
      temp: '-'
    };

    if (this.devices.find(device => device.id == peripheralData.id) === undefined) {
      this.devices.push(deviceData);
    }

    this.ble.startNotification(peripheralData.id, SENSORTAG_TEMP_SERVICE, SENSORTAG_TEMP_CHARACTERISTIC).subscribe(
      data => {
        var tempData = new Float32Array(data);
        var tempVal = tempData[0]; //TODO: Format
        
        var notifyingDevice = this.devices.find(device => device.id == peripheralData.id);
        if (notifyingDevice !== undefined) {
          notifyingDevice.temp = tempVal;
        }
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
