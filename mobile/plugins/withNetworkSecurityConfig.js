const { withAndroidManifest } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const withNetworkSecurityConfig = (config) => {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const app = androidManifest.manifest.application[0];

    app.$["android:networkSecurityConfig"] = "@xml/network_security_config";
    app.$["android:usesCleartextTraffic"] = "true";

    const projectRoot = config.modRequest.projectRoot;
    const srcXmlPath = path.resolve(projectRoot, "plugins/network_security_config.xml");
    const resXmlDir = path.resolve(projectRoot, "android/app/src/main/res/xml");

    if (!fs.existsSync(resXmlDir)) {
      fs.mkdirSync(resXmlDir, { recursive: true });
    }

    const destXmlPath = path.resolve(resXmlDir, "network_security_config.xml");
    fs.copyFileSync(srcXmlPath, destXmlPath);

    return config;
  });
};

module.exports = withNetworkSecurityConfig;

