//加载高德地图选点组件。
window._AMapSecurityConfig = {
    serviceHost: window.location.origin + '/_AMapService',
};
async function AMap() {
    const appKey = await fetch("./api/AmapKey").then(res => res.json());
    await new Promise(resolve => {
        let js = document.createElement("script");
        js.src = "https://webapi.amap.com/loader.js";
        js.onload = () => resolve();
        document.head.append(js);
    });
    return await AMapLoader.load({
        key: appKey.key,
        version: "2.0",
        plugins: ["AMap.ToolBar", "AMap.Scale", "AMap.Geocoder"],
    });

}
export default AMap();