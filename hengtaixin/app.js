let bluetoothDevice;
let charNotify;
let charTxtWrite;
let charTempWrite;

const DEFAULT_BLE_MTU = 20;
const TXT_ONLY_MAGIC = 0x0d;

const SERVICE_UUID = "cafe0001-b5a3-f393-e0a9-e50e24dcca9e";//"0000fff0-0000-1000-8000-00805f9b34fb"; //"CAFE0001-B5A3-F393-E0A9-E50E24DCCA9E";
const CHAR_NOTIFY = "cafe0002-b5a3-f393-e0a9-e50e24dcca9e"; // 0x0003
const CHAR_TXT_WRITE = "cafe0003-b5a3-f393-e0a9-e50e24dcca9e"; // 0x0002

const ACK_TYPE_LINK = 0x00;
const ACK_SUBTYPE_LINK_OK = 0x00;
const ACK_SUBTYPE_LINK_ERR = 0x01;

const ACK_TYPE_DRAW = 0x01;
const ACK_SUBTYPE_DRAW_OK = 0x00;
const ACK_SUBTYPE_DRAW_ERR = 0x01;

let bleMtuSize = DEFAULT_BLE_MTU;

const SUBTYPE_DRAW_SAVE_BINARY_TEMPLATE = 0x04;
const encryptionMethod = 0;

let templateFile = null;
let nowTemp = 0;

async function onScanButtonClick() {
  let options = { filters: [{ services: [SERVICE_UUID] },{ namePrefix: "greenjoy-" }] };

  bluetoothDevice = null;
  console.log("Requesting Bluetooth Device...");
  navigator.bluetooth
    .requestDevice(options)
    .then(async (device) => {
      bluetoothDevice = device;
      bluetoothDevice.addEventListener(
        "gattserverdisconnected",
        onDisconnected
      );

      await connect();
    })
    .catch((error) => {
      console.log("Argh! " + error);
    });
}

async function connect() {
  try {
    charTxtWrite = null;
    charTempWrite = null;
    charNotify = null;
    console.log("Connecting to Bluetooth Device...");
    let server = await bluetoothDevice.gatt.connect();
    console.log("> Bluetooth Device connected");
    console.log(
      ">>> getPrimaryService",
      server.getPrimaryService(SERVICE_UUID)
    );
    let service = await server.getPrimaryService(SERVICE_UUID);
    console.log("service", service);
    console.log("Getting Characteristic...");
    await enumerateGatt(server);

    if (charNotify) {
      console.log(`Found Characteristic: ${charNotify.uuid}`);
      await charNotify.startNotifications();
      console.log("> Notifications started");
      charNotify.addEventListener(
        "characteristicvaluechanged",
        handleNotifications
      );
    }
  } catch (error) {
    document.querySelector("#send").disabled = true;
    document.querySelector("#disconnect").disabled = true;
    console.error("Argh! " + error);
  }
}

async function enumerateGatt(server) {
  const services = await server.getPrimaryServices();
  console.log(services);
  const sPromises = services.map(async (service) => {
    const characteristics = await service.getCharacteristics();
    console.log(characteristics)
    const cPromises = characteristics.map(async (characteristic) => {
      // issue: https://github.com/WebBluetoothCG/web-bluetooth/issues/532
      // let descriptors = await characteristic.getDescriptors();
      // descriptors = descriptors.map(
      //   (descriptor) => `\t\t|_descriptor: ${descriptor.uuid}`
      // );
      // console.log("characteristic", characteristic)
      let descriptors = []
      descriptors.unshift(`\t|_characteristic: ${characteristic.uuid}`);
      if (characteristic.uuid === CHAR_NOTIFY) {
        charNotify = characteristic;
      }
      if (characteristic.uuid === CHAR_TXT_WRITE) {
        charTxtWrite = characteristic;
      }
      document.querySelector("#disconnect").disabled = false;
      document.querySelector("#send").disabled = false;
      return descriptors.join("\n");
    });

    const descriptors = await Promise.all(cPromises);
    descriptors.unshift(`service: ${service.uuid}`);
    return descriptors.join("\n");
  });

  const result = await Promise.all(sPromises);
  console.log(result.join("\n"));
}

async function sendTextOnly(strings) {
  let textData = new Uint8Array();

  for (i = 0; i < strings.length; i++) {
    if (strings[i].length <= 0x7f) {
      const encoder = new TextEncoder();
      const encodedData = encoder.encode(strings[i]);
      textData = new Uint8Array(encodedData);
    }
  }
  console.log("data:", textData);
  await writeDataChunk(textData, "TXT_ONLY");
}

async function writeDataChunk(data, type) {
  // send data splited by MTU, then send the remaining in recursion

  if (data === "" || data === null || data === undefined) return;

  pkt = data.slice(0, bleMtuSize); // splite by MTU
  remain = data.slice(bleMtuSize);
  let typedArray = new Uint8Array(pkt);
  console.log("   sending chunk", typedArray.buffer);
  let charWrite = type === "TEMP" ? charTempWrite : charTxtWrite;
  await charWrite
    .writeValueWithResponse(typedArray.buffer)
    .then(async () => {
      console.log("data sent", typedArray.length);
      if (remain.length) {
        await writeDataChunk(remain, type);
      } else {
        console.log("All chunks(s) sent.");
      }
    })
    .catch((e) => {
      console.log(e);
    });
}

function concatArrayBuffer(arrayOne, arrayTwo) {
  // a, b TypedArray of same type

  let mergedArray = new Uint8Array(arrayOne.length + arrayTwo.length);
  mergedArray.set(arrayOne);
  mergedArray.set(arrayTwo, arrayOne.length);
  return mergedArray;
}

function onDisconnectButtonClick() {
  if (!bluetoothDevice) {
    return;
  }
  console.log("Disconnecting from Bluetooth Device...");
  if (bluetoothDevice.gatt.connected) {
    if (charNotify) {
      charNotify
        .stopNotifications()
        .then((_) => {
          console.log("> Notifications stopped");
          charNotify.removeEventListener(
            "characteristicvaluechanged",
            handleNotifications
          );
        })
        .then((_) => {
          bluetoothDevice.gatt.disconnect();
          updateDeviceStatus("RESET", null);
        })
        .catch((error) => {
          console.log("Argh! " + error);
        });
    } else {
      bluetoothDevice.gatt.disconnect();
      updateDeviceStatus("RESET", null);
    }
  } else {
    console.log("> Bluetooth Device is already disconnected");
  }
}

function onDisconnected(event) {
  // Object event.target is Bluetooth Device getting disconnected.
  console.log("> Bluetooth Device disconnected");
  document.querySelector("#send").disabled = true;
  document.querySelector("#disconnect").disabled = true;
  document.querySelector("#upload-temp").disabled = true;
}

function handleNotifications(event) {
  let value = event.target.value;
  let data = [];
  for (let i = 0; i < value.byteLength; i++) {
    data.push("0x" + ("00" + value.getUint8(i).toString(16)).slice(-2));
  }
  console.log("> " + data.join(" "));
  let dataSent = document.querySelector("#data-sent");
  dataSent.innerHTML = data//result ? "Data Sent OK" : "Data Sent Failed";
}

function updateDeviceStatus(scope, result) {
  let dataSent = document.querySelector("#data-sent");
  if (scope === "LINK") {
    dataSent.innerHTML = result ? "Data Sent OK" : "Data Sent Failed";
    dataSent.className = result ? "text-success" : "text-danger";
  } else if (scope === "DRAW") {
  } else if (scope === "RESET") {
    dataSent.innerHTML = "N";
    dataSent.className = null;
  }
}

async function onSendTextOnly() {
  let customField1 = document.querySelector("#custom-field1").value;
  try {
    updateDeviceStatus("RESET", null);
    await sendTextOnly([
      customField1
    ]);
  } catch (error) {
    console.error(error);
  }
}
async function onSendTextBymxj() {
  let name = document.querySelector("#name").value;
  let status = document.querySelector("#status").value;
  let busyTime = document.querySelector("#busy-time").value;
  let stationNumber = document.querySelector("#station-number").value;
  let time = document.querySelector("#time").value;
  let qrcode = document.querySelector("#qrcode").value;
  let SendTexts = nowTemp === 0 ? [name, stationNumber, time, qrcode]: [name, status, busyTime, stationNumber, time, qrcode]
  try {
    updateDeviceStatus("RESET", null);
    await sendTextOnly(nowTemp, SendTexts);
  } catch (error) {
    console.error(error);
  }
}
function selectTemp(obj) {
  var index = obj.selectedIndex;
  var val = obj.options[index].value;
  nowTemp = +val;
  let statusDoc = document.querySelector("#status-box");
  let busyTimeDoc = document.querySelector("#busy-time-box");
  if (val === "0"){
    statusDoc.style.display = "none";
    busyTimeDoc.style.display = "none";
  } else {
    statusDoc.style.display = "flex";
    busyTimeDoc.style.display = "flex";
  }
}

const sendPacket = async (type, subType, data) => {
  pkt = buildPacket(type, subType, uint8ArrToInt(data));
  console.log("pkt length:", pkt.length);
  arr = [];
  const textEncoderStream = new TransformStream({
    transform(chunk, controller) {
      // console.log('[transform]', chunk);
      arr.push(END_);
      encode(chunk, slice, add);
      arr.push(END_);
      controller.enqueue(arr);
    },
    flush(controller) {
      console.log("[flush]");
      controller.terminate();
    },
  });
  const readStream = textEncoderStream.readable;
  const writeStream = textEncoderStream.writable;
  const writer = writeStream.getWriter();

  writer.write(pkt);
  writer.close();
  console.log("textEncoderStream.locked", textEncoderStream.locked);
  const reader_ = readStream.getReader();
  for (
    let result = await reader_.read();
    !result.done;
    result = await reader_.read()
  ) {
    console.log("[value]", result.value);
    let data = new Uint8Array(result.value);
    await writeDataChunk(data, "TEMP");
  }
};

// 组装数据包
const buildPacket = (type, subType, data) => {
  // Header Format: [ EncryptionMethod:2b ] [ Type:3b ] [ SubType:3b ] [PayloadLength:20b] [Reserved:4b]
  var pkt = [];
  const reserved = 0;
  var _t = (encryptionMethod << 6) | (type << 3) | subType;
  console.log("_t", _t);
  console.log(encryptionMethod, type, subType);
  length = data.length;

  pkt.push(_t);
  pkt.push(length & 0xff);
  pkt.push((length >> 8) & 0xff);
  pkt.push(((length >> 16) & 0x0f) | (reserved << 4));
  // append data
  pkt = pkt.concat(data);
  // append CRC
  pkt = assemblyCrc(pkt);
  console.log("组装部分", pkt);

  return pkt;
};

const assemblyCrc = (list) => {
  var crc = caluCRC(0, list);
  console.log("CRC=", crc);
  var checksumByte1 = crc & 0xff;
  var checksumByte2 = (crc >> 8) & 0xff;
  list.push(checksumByte1);
  list.push(checksumByte2);
  return list;
};
