const END_ = 192
const ESC = 219
const ESC_END = 220
const ESC_ESC = 221

const buf = {
    end: new Uint8Array([END_]),
    esc: new Uint8Array([ESC]),
    escend: new Uint8Array([ESC, ESC_END]),
    escesc: new Uint8Array([ESC, ESC_ESC])
}
const END = buf.end

function encode(chunk, slice, add) {
    let start, end
    for (start = 0, end = 0; end < chunk.length; end += 1) {
        switch (chunk[end]) {
            case ESC:
                (end > start) && slice(chunk, start, end)
                add(buf.escesc)
                start = end + 1
                break
            case END:
                (end > start) && slice(chunk, start, end)
                add(buf.escend)
                start = end + 1
                break
        }
    }
    (end > start) && slice(chunk, start, end)
}
function uint8ArrToInt(uint8Arr) {
  var arr = []
  for(var i = 0; i < uint8Arr.length; i++) {
      arr.push(uint8Arr[i])
  }
  return arr
}

let arr = [];
function slice(chunk, start, end) {
  console.log("++slice", uint8ArrToInt(chunk.slice(start, end)))
  arr = arr.concat(uint8ArrToInt(chunk.slice(start, end)))
  console.log("arr", arr)
}
function add(data) {
  console.log("++add", data)
  arr.push(data)
}


