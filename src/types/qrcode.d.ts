declare module "qrcode" {
  const qrcode: {
    toDataURL: (text: string, opts?: object) => Promise<string>;
  };
  export default qrcode;
}
