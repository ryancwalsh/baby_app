/**
 * Minimal subset of Nanit's reverse-engineered camera websocket protocol, just
 * enough to read and write the night light. Field numbers come from the
 * community projects listed in README.md.
 *
 * The schema is a string rather than a `.proto` file because protobufjs loads
 * files relative to the working directory, which is not something a bundled
 * Next.js server build can be relied upon to preserve.
 */
export const NANIT_PROTO = `
syntax = "proto2";
package nanit;

/**
 * The full set, even though only a few are used: the camera pushes requests of
 * its own (PUT_SENSOR_DATA especially), and protobuf2 drops enum values it does
 * not know. Dropping the value clears the required \`type\` field, which makes
 * decoding the whole frame throw.
 */
enum RequestType {
  PUT_STREAMING = 2;
  GET_STREAMING = 3;
  GET_SETTINGS = 4;
  PUT_SETTINGS = 5;
  GET_CONTROL = 6;
  PUT_CONTROL = 7;
  GET_STATUS = 8;
  PUT_STATUS = 9;
  PUT_SENSOR_DATA = 11;
  GET_SENSOR_DATA = 12;
  GET_UCTOKENS = 13;
  PUT_UCTOKENS = 14;
  PUT_SETUP_NETWORK = 15;
  PUT_SETUP_SERVER = 16;
  GET_FIRMWARE = 17;
  PUT_FIRMWARE = 18;
  GET_PLAYBACK = 19;
  PUT_PLAYBACK = 20;
  GET_SOUNDTRACKS = 21;
  GET_STATUS_NETWORK = 22;
  GET_LIST_NETWORKS = 23;
  GET_LOGS = 24;
  GET_BANDWIDTH = 25;
  GET_AUDIO_STREAMING = 26;
  PUT_AUDIO_STREAMING = 27;
  GET_WIFI_SETUP = 28;
  PUT_WIFI_SETUP = 29;
  PUT_STING_START = 30;
  PUT_STING_STOP = 31;
  PUT_STING_STATUS = 32;
  PUT_STING_ALERT = 34;
  PUT_KEEP_ALIVE = 35;
  GET_STING_STATUS = 36;
  PUT_STING_TEST = 37;
  PUT_RTSP_STREAMING = 38;
  GET_UOM_URI = 39;
  GET_UOM = 40;
  PUT_UOM = 41;
  GET_AUTH_KEY = 42;
  PUT_AUTH_KEY = 43;
  PUT_HEALTH = 44;
  PUT_TCP_REQUEST = 45;
  GET_STING_START = 46;
  GET_LOGS_URI = 47;
}

message Settings {
  /** Night light brightness, 0-100. */
  optional int32 nightLightBrightness = 24;
}

message Control {
  enum NightLight {
    LIGHT_OFF = 0;
    LIGHT_ON = 1;
  }

  optional NightLight nightLight = 3;
  optional int32 nightLightTimeout = 6;
}

message GetSettings {
  optional bool all = 1;
}

/**
 * Everything is optional, including fields the protocol treats as mandatory:
 * the camera emits frames that omit them (a request carrying only an id, for
 * one), and a missing \`required\` field makes protobufjs throw away the entire
 * frame rather than the field.
 */
message Request {
  optional int32 id = 1;
  optional RequestType type = 2;
  optional Settings settings = 5;
  /**
   * Field number found by probing: GET_SETTINGS answers "Bad Request: missed
   * 'getsettings' field" until this is set. None of the published community
   * protos declare it.
   */
  optional GetSettings getSettings = 6;
  optional Control control = 15;
}

message Response {
  optional int32 requestId = 1;
  optional RequestType requestType = 2;
  optional int32 statusCode = 3;
  optional string statusMessage = 4;
  optional Settings settings = 6;
  optional Control control = 15;
}

message Message {
  enum Type {
    KEEPALIVE = 0;
    REQUEST = 1;
    RESPONSE = 2;
  }

  optional Type type = 1;
  optional Request request = 2;
  optional Response response = 3;
}
`;
