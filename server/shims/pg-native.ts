export default class UnsupportedPgNative {
  constructor() {
    throw new Error('pg-native is not supported in the Cloudflare Worker runtime')
  }
}
