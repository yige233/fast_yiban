import {
    dom,
    randomID
} from "./tool.js";
import AMap from "./amap.js"

const rendered = Symbol("rendered");

class yibanElem extends HTMLElement { //自定义元素挺不错的，就是要自己写css很烦
    constructor(selector, useShadow = true) {
        if (!selector) throw new Error("需要提供模板selector");
        super();
        this.selector = selector;
        this.useShadow = useShadow;
        this[rendered] = false;
    };
    static get observedAttributes() { //需要被观察的属性
        return ["required", "desc"];
    };
    get rendered() {
        return this[rendered];
    };
    async connectedCallback() { //当元素被附加到dom上时，就会调用该方法。
        this.shadow = this.useShadow ? this.attachShadow({
            mode: "closed"
        }) : this;
        const content = document.querySelector(this.selector).content.cloneNode(true);
        this.shadow.append(content);
        await this.render();
        this[rendered] = true;
        this.attributeChangedCallback();
    };
    attributeChangedCallback(name, oldValue, newValue) { //当元素的被监视的属性发生变化时，就会调用该方法。
        if (!this[rendered]) return;
        const desc = [];
        if (this.getAttribute("required") != null && this.getAttribute("required") != "false") desc.push("必须项:");
        desc.push(this.getAttribute("desc") || "");
        this.getElem(".desc").innerText = desc.join(" ");

        this.attrRender(name, oldValue, newValue);
    };
    async render() {};
    attrRender() {};
    trigger(data) { //触发 yiban-formdata 事件
        this.dispatchEvent(new CustomEvent("yiban-formdata", {
            detail: data
        }));
    };
    static defineSelf(tagName) {
        if (tagName.indexOf("-") == -1) return false;
        customElements.define(tagName.toLocaleLowerCase(), this);
    };
    getElem(selector) {
        return this.shadow.querySelector(selector);
    };
};

class AreaSelect extends yibanElem {
    constructor() {
        super(".yibanAreaSelect");
    };
    render() {
        this.getElem(".content").addEventListener("input", e => {
            const data = [];
            for (let input of this.getElem(".content").querySelectorAll("input")) data.push(input.value);
            this.trigger(data);
        });
    };
};

class TakePosition extends yibanElem {
    mapType = "AutoTakePosition";
    constructor() {
        super(".yibanTakePosition", false);
    };
    static get observedAttributes() {
        return super.observedAttributes.concat(["type"]);
    };
    attrRender() {
        this.mapType = ["AutoTakePosition", "GdMap"].includes(this.getAttribute("type")) ? this.getAttribute("type") : "AutoTakePosition";
    };
    async render() {
        const Amap = await AMap;
        let marker = null;
        const map = new Amap.Map(this.getElem(".Amap"), {
            zoom: 11
        });
        map.addControl(new Amap.Scale());
        map.addControl(new Amap.ToolBar({
            position: {
                left: 5,
                top: 5
            },
            offset: [10, 10]
        }));
        map.on("click", async e => {
            marker && marker.remove();
            marker = new Amap.Marker({
                position: new Amap.LngLat(e.lnglat.getLng(), e.lnglat.getLat()),
                icon: "https://a.amap.com/jsapi_demos/static/demo-center/icons/poi-marker-default.png",
                anchor: "bottom-center"
            });
            map.add(marker);
            const Geocoder = new Amap.Geocoder({
                city: "010"
            });
            const data = await new Promise(resolve => Geocoder.getAddress(e.lnglat, (status, result) => {
                if (status != "complete" || result.info != "OK") return resolve(false);
                if (this.mapType == "AutoTakePosition") {
                    resolve({
                        longitude: e.lnglat.getLng(),
                        latitude: e.lnglat.getLat(),
                        address: result.regeocode.formattedAddress
                    });
                } else {
                    resolve({
                        location: e.lnglat.getLng() + "," + e.lnglat.getLat(),
                        name: result.regeocode.formattedAddress,
                        address: result.regeocode.formattedAddress
                    });
                };
            }));
            if (!data) return;
            this.getElem(".address").innerHTML = "定位到：" + data.address;
            this.trigger(data);
        });
    };
};

class Selector extends yibanElem {
    type = "radio";
    constructor() {
        super(".yibanSelector");
    };
    static get observedAttributes() {
        return super.observedAttributes.concat(["options", "name", "type"]);
    };
    render() {
        const container = this.getElem(".content");
        container.addEventListener("change", e => {
            const data = [];
            for (let input of container.querySelectorAll("input")) {
                if (input.checked) {
                    if (this.type == "radio") {
                        return this.trigger(input.value);
                    };
                    if (this.type == "checkbox") data.push(input.value);
                };
            };
            this.trigger(data);
        });
    };
    attrRender() {
        const type = (this.getAttribute("type") || "radio").toLocaleLowerCase();
        this.type = ["radio", "checkbox"].includes(type) ? type : "radio";
        const container = this.getElem(".content");
        container.innerHTML = "";
        const name = this.getAttribute("name") || randomID();
        const options = this.getAttribute("options").split("|") || [];
        for (let option of options) container.append(dom(`<label for="${name+option}"><input type="${this.type}" name="${name}" value="${option}" id="${name+option}"/>${option}</label>`));
    };
};

class Textarea extends yibanElem {
    constructor() {
        super(".yibanTextarea");
    };
    static get observedAttributes() {
        return super.observedAttributes.concat(["placeholder"]);
    };

    render() {
        this.getElem(".content").addEventListener("input", e => {
            this.trigger(this.getElem("textarea").value);
        });
    };
    attrRender() {
        this.getElem("textarea").setAttribute("placeholder", this.getAttribute("placeholder") || "");
    };
};

class File extends yibanElem {
    data = new Map();
    constructor() {
        super(".yibanFile");
    };
    static get observedAttributes() {
        return super.observedAttributes.concat(["type"]);
    };
    singleUpload(type) {
        const id = randomID();
        const div = document.createElement("div");
        div.append(document.querySelector(".yibanSingleFile").content.cloneNode(true));
        const fileInput = div.querySelector("div.file > div:nth-child(1)");
        const urlInput = div.querySelector("div.file> div:nth-child(2)");
        div.addEventListener("change", () => {
            const data = {
                type: type,
                upload: div.querySelector("select:nth-child(2)").value,
                allowAuto: (div.querySelector("select:nth-child(3)").value == "true") ? true : false
            };
            if (data.upload == "url") {
                fileInput.setAttribute("style", "display:none");
                urlInput.setAttribute("style", "display:block");
                const urlInputElem = urlInput.querySelectorAll("input");
                data.data = {
                    name: urlInputElem[0].value || null,
                    url: urlInputElem[1].value || null
                };
                fileInput.querySelector("input").setAttribute("accept", "*");
            } else {
                fileInput.setAttribute("style", "display:block");
                urlInput.setAttribute("style", "display:none");
                fileInput.querySelector("input").setAttribute("accept", "image/*");
                data.data = fileInput.querySelector("input").files[0] || null;
            };
            this.data.set(id, data);
            this.trigger(this.data);
        });
        if (type != "signature") {
            const del = dom(`<button>删除</button>`);
            del.addEventListener("click", () => {
                if (this.data.has(id)) this.data.delete(id);
                div.remove();
            });
            div.append(del);
        };
        return div;
    };
    attrRender() {
        const attrType = (this.getAttribute("type") || "attachment").toLocaleLowerCase();
        const type = ["attachment", "signature", "image"].includes(attrType) ? attrType : "attachment";
        const container = this.getElem(".content");
        container.innerHTML = "";
        this.data.clear();
        container.append(this.singleUpload(type));
        if (type != "signature") {
            const addMore = dom(`<div><button>添加图片（文件）</button></div>`);
            addMore.addEventListener("click", e => addMore.before(this.singleUpload(type)));
            container.append(addMore);
        };
    };

};

class Date extends yibanElem {
    constructor() {
        super(".yibanDate");
    };
    render() {
        this.getElem(".content").addEventListener("input", e => {
            this.trigger(this.getElem("input").value);
        });
    };
};

class Text extends yibanElem {
    constructor() {
        super(".yibanText");
    };
    static get observedAttributes() {
        return super.observedAttributes.concat(["content"]);
    };
    attrRender() {
        this.getElem(".content").innerHTML = "说明：" + this.getAttribute("content") || "无";
    };
};

const components = {
    AreaSelect,
    TakePosition,
    Selector,
    Textarea,
    File,
    Date,
    Text
};
export default components;