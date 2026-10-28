// Where the catalog of blanks comes from.
//
// Today: "manual". Products are entered in the dashboard (Custom catalog tab) and stored in SQLite.
// Each product carries brand + style_number (e.g. "Port & Company" / "PC54"), the same keys SanMar uses
// for its product data, so nothing on the pages has to change when live data is connected.
//
// Later: "sanmar". Once Imagepro is a SanMar customer with integration access (they email
// sanmarintegrations@sanmar.com and sign the integration agreement), set these on the server:
//   SANMAR_CUSTOMER_NUMBER, SANMAR_USERNAME, SANMAR_PASSWORD   (a web user made just for the site)
// and add a small sync job here that looks up each product by style_number (SanMar's SOAP product
// service, or their FTP data files) and fills in colors, sizes, images and stock. Credentials stay on
// the server; the browser never sees them. Decorated prices stay Imagepro's own (set in the dashboard).

const configured = () => !!(process.env.SANMAR_CUSTOMER_NUMBER && process.env.SANMAR_USERNAME && process.env.SANMAR_PASSWORD);

function status() {
  return {
    source: 'manual',
    sanmarCredentials: configured(),
    note: configured()
      ? 'SanMar login is set on the server. The live sync still needs to be switched on by Real Easy Sites.'
      : 'Products are entered by hand. Brand and style # match SanMar, so live colors, sizes and stock can be connected later.',
  };
}

module.exports = { status, configured };
