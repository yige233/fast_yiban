class tool {
    static b64en(data) {
        return window.btoa(encodeURIComponent(data));
    };
    static b64de(data) {
        return decodeURIComponent(window.atob(data));
    };
    static loadjs(url, callback) {
        let js = document.createElement("script");
        js.src = url;
        js.onload = () => {
            callback && callback();
        };
        document.head.append(js);
    };
    static showinfo(info) {
        let infobox = document.querySelector("#result")
        infobox.innerHTML = "";
        for (let i of info) {
            if (i[0] == "text") {
                var text = document.createElement("div");
                text.textContent = i[1];
                infobox.append(text);
            }
            if (i[0] == "link") {
                var link = document.createElement("a");
                link.target = "_blank";
                link.textContent = i[1];
                link.href = i[1];
                infobox.append(link);
            }
        }
    };
    static getQueryVariable(variable) {
        let query = new URLSearchParams(window.location.search);
        if (query.has(variable)) {
            return query.get(variable);
        };
        return false;
    };
}
class Submit {
    maindata = {
        wfid: 0,
        account: "",
        passwd: "",
        submit: {},
        extra: {}
    };
    submit = {};
    constructor(Amap_key) {
        tool.loadjs("https://webapi.amap.com/loader.js", async () => {
            this.AMap = await AMapLoader.load({
                key: Amap_key,
                version: "2.0",
                plugins: ["AMap.ToolBar", "AMap.Scale", "AMap.Geocoder"],
            });
        });
    };
    addaccount(account, passwd) {
        this.maindata.account = account;
        this.maindata.passwd = passwd;
    };
    loadjson(res) {
        for (let el of document.querySelector("ul").children) el.getAttribute("blocktype") && el.remove();
        const loadMap = (id) => {
            let container = document.querySelector("#" + id);
            if (!container || container.getAttribute("used")) return false;
            let the_marker = "";
            let map = new this.AMap.Map(id, {
                zoom: 11
            });
            map.addControl(new this.AMap.Scale());
            map.addControl(new this.AMap.ToolBar({
                position: {
                    left: 5,
                    top: 5
                },
                offset: [10, 10]
            }));
            map.on('click', (e) => {
                the_marker && the_marker.remove();
                new this.AMap.Geocoder({
                    city: '010'
                }).getAddress(e.lnglat, (status, result) => {
                    if (status != 'complete' || result.info != 'OK') return false;
                    let marker = new this.AMap.Marker({
                        position: new this.AMap.LngLat(e.lnglat.getLng(), e.lnglat.getLat()),
                        icon: 'https://a.amap.com/jsapi_demos/static/demo-center/icons/poi-marker-default.png',
                        anchor: 'bottom-center',
                        title: result.regeocode.formattedAddress
                    });
                    map.add(marker);
                    the_marker = marker;
                    if (container.getAttribute("prop") == "AutoTakePosition") container.setAttribute("data", JSON.stringify({
                        longitude: e.lnglat.getLng(),
                        latitude: e.lnglat.getLat() + "," + e.lnglat.getLat(),
                        address: result.regeocode.formattedAddress
                    }));
                    if (container.getAttribute("prop") == "GdMap") container.setAttribute("data", JSON.stringify({
                        location: e.lnglat.getLng(),
                        name: result.regeocode.formattedAddress,
                        address: result.regeocode.formattedAddress
                    }));
                    container.setAttribute("positioned", true);
                    container.previousElementSibling.previousElementSibling.innerHTML = "???????????????" + result.regeocode.formattedAddress;
                });
            });
            container.setAttribute("used", true);
        };
        const TakePosition = (el, type) => {
            el.setAttribute("blocktype", "autoposition");
            let container = document.createElement("div");
            container.id = "pos_select";
            container.setAttribute("prop", type);
            container.style = "width: 90%;height: 400px;";
            el.append(container);
            return el;
        };
        const AreaSelect = (el) => {
            el.setAttribute("blocktype", "position");
            for (let x = 0; x < 3; x++) {
                var input = document.createElement("input");
                input.type = "text";
                input.placeholder = "??????????????????????????????";
                el.append(input);
            };
            return el;
        };
        const Radio = (el, id, props) => {
            el.setAttribute("blocktype", "radio");
            for (let x of props.options) {
                let input = document.createElement("input"),
                    span = document.createElement("span"),
                    br = document.createElement("br");
                input.type = "radio";
                input.name = id;
                input.value = x;
                span.textContent = x;
                el.append(input);
                el.append(span);
                el.append(br);
            };
            return el;
        };
        const Text = (el) => {
            el.setAttribute("blocktype", "text");
            let input = document.createElement("input");
            input.type = "text";
            el.append(input);
            return el;
        };
        const Checkbox = (el, id, props) => {
            el.setAttribute("blocktype", "checkbox");
            for (let x of props.options) {
                let input = document.createElement("input"),
                    span = document.createElement("span"),
                    br = document.createElement("br");
                input.type = "checkbox";
                input.name = id;
                input.value = x;
                span.textContent = x;
                el.append(input);
                el.append(span);
                el.append(br);
            };
            return el;
        };
        const Imageurl = (el) => {
            function urlgroup() {
                let div = document.createElement("div");
                let url = document.createElement("input");
                url.type = "text";
                url.placeholder = "?????????????????????????????????";
                let name = document.createElement("input");
                name.type = "text";
                name.placeholder = "???????????????????????????";
                div.append(url);
                div.append(name);
                return div;
            };
            el.setAttribute("blocktype", "image");
            el.append(urlgroup());
            let more = document.createElement("button");
            more.innerText = "????????????";
            more.onclick = () => more.before(urlgroup());
            el.append(more);
            return el;
        };
        const getDate = (el) => {
            el.setAttribute("blocktype", "date");
            let input = document.createElement("input");
            input.type = "date";
            el.append(input);
            return el;
        };
        const unkonwnComponent=(el,component)=>{
            let div=document.createElement("div");
            div.innerText=`???????????????????????????????????????????????????${component}`;
            el.append(div);
            return el;
        };
        var ul = document.querySelector("ul"),
            json_ = res.data,
            wfid = json_.Id;
        if (app.bl.includes(wfid)) return false;
        document.querySelector("#formname").textContent = json_.WFName;
        for (let form of json_.Form) {
            let props = form.props;
            let id = form.id,
                el = document.createElement("li"),
                desc = document.createElement("span"),
                br = document.createElement("br");
            el.id = id;
            desc.textContent = `${props.required?"????????????":""}${props.extra ?props.extra+"???":""}${props.label}`;
            el.append(desc);
            el.append(br);
            switch (form.component) {
                case "AutoTakePosition":
                    el = TakePosition(el, "AutoTakePosition");
                    break;
                case "GdMap":
                    el = TakePosition(el, "GdMap");
                    break;
                case "AreaSelect":
                    el = AreaSelect(el);
                    break;
                case "Radio":
                    el = Radio(el, id, props);
                    break;
                case "Input":
                case "Textarea":
                case "InputNumber":
                    el = Text(el);
                    break;
                case "Checkbox":
                    el = Checkbox(el, id, props);
                    break;
                case "Image":
                    el = Imageurl(el, id, props);
                    break;
                case "Date":
                    el = getDate(el);
                    break;
                case "Text":
                    desc.textContent = `?????????${props.text}`;
                    break;
                default:
                    el = unkonwnComponent(el,form.component);
                    console.log("???????????????????????????????????????????????????", form.component);
                    break;
            }
            ul.append(el);
            loadMap("pos_select");
        };
        this.maindata.wfid = wfid;
        return true;
    };
    buildjson(id) {
        let data;
        let el = document.getElementById(id);
        let type = el.getAttribute("blocktype") ? el.getAttribute("blocktype") : null;
        switch (type) {
            case "autoposition":
                if (!el.querySelector("#pos_select").getAttribute("positioned")) break;
                data = JSON.parse(el.querySelector("#pos_select").getAttribute("data"));
                this.maindata.extra[id] = "TimeStamp";
                break;
            case "position":
                data = [];
                for (let i = 0; i < 3; i++) {
                    data[i] = el.querySelectorAll("input")[i].value;
                };
                break;
            case "radio":
                var inputs = el.querySelectorAll("input");
                for (let input of inputs) {
                    if (input.checked == true) {
                        data = input.value;
                        break;
                    };
                };
                break;
            case "text":
                data = el.querySelectorAll("input")[0].value;
                break;
            case "checkbox":
                data = [];
                var inputs = el.querySelectorAll("input");
                for (let i = 0; i < inputs.length; i++) {
                    if (inputs[i].checked == true) {
                        data[i] = inputs[i].value;
                    };
                };
                data = data.filter((item) => item);
                break;
            case "image":
                data = [];
                var groups = el.querySelectorAll("div");
                for (let group of groups) data.push({
                    url: group.querySelectorAll("input")[0].value,
                    name: group.querySelectorAll("input")[1].value,
                });
                this.maindata.extra[id] = "ImageUpload";
                break;
            case "date":
                data = el.querySelectorAll("input")[0].value;
                break;
            default:
                break;
        };
        this.submit[id] = data;
    };
    async postdata(url) {
        tool.showinfo([
            ["text", "?????????????????????"]
        ]);
        try {
            let res = await fetch(url, {
                headers: {
                    "content-type": "application/json;charset=UTF-8"
                },
                method: "POST",
                body: JSON.stringify(this.fulljson)
            });
            let json = await res.json();
            switch (json.code) {
                case 0:
                case 1:
                    tool.showinfo([
                        ["text", "?????????" + json.ts],
                        ["text", json.msg],
                        ["text", "5??????????????????"],
                    ]);
                    setTimeout(() => {
                        location.reload()
                    }, 300000);
                    break;
                case 2:
                    let result = this.loadjson(json.fullmsg);
                    if (result) {
                        tool.showinfo([
                            ["text", "?????????" + json.ts],
                            ["text", "??????id??????????????????id???"],
                            ["text", json.msg],
                            ["text", "???id????????????????????????????????????"],
                        ]);
                    } else {
                        tool.showinfo([
                            ["text", "????????????????????????????????????????????????"],
                            ["text", "???id??? " + json.msg],
                            ["text", "5??????????????????"],
                        ]);
                        setTimeout(() => {
                            location.reload()
                        }, 300000);
                    };
                    break;
                case 3:
                    tool.showinfo([
                        ["text", "?????????" + json.ts],
                        ["text", "??????????????????????????????"],
                        ["link", json.msg],
                    ]);
                    history.pushState(200, "", window.location.origin + window.location.pathname + "?sign_data=" + encodeURIComponent(tool.b64en(JSON.stringify(this.fulljson))));
                    break;
                default:
                    break;
            };
        } catch (err) {
            tool.showinfo([
                ["text", "??????????????????????????????5??????????????????"]
            ]);
            setTimeout(() => location.reload, 300000);
            console.error(err);
        };
    };
    get fulljson() {
        this.maindata.submit = JSON.stringify(this.submit);
        return this.maindata;
    };
};
const app = {
    bl: [],
    submit: "",
    init: async function () {
        window._AMapSecurityConfig = {
            serviceHost: window.location.origin + '/_AMapService',
        };
        let burl = "b"; //???????????????????????????????????????????????????html???css
        if (navigator.userAgent.match(/(phone|pad|pod|iPhone|iPod|ios|iPad|Android|Mobile|BlackBerry|IEMobile|MQQBrowser|JUC|Fennec|wOSBrowser|BrowserNG|WebOS|Symbian|Windows Phone)/i)) {
            document.head.append(new DOMParser().parseFromString('<link rel="stylesheet" href="/css/mobile.css" type="text/css">', 'text/html').head.children[0])
            document.head.append(new DOMParser().parseFromString('<meta http-equiv="X-UA-Compatible" content="IE=edge">', 'text/html').head.children[0])
            document.head.append(new DOMParser().parseFromString('<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0">', 'text/html').head.children[0])
            burl = "b-mobile"; //???????????????????????????
        } else {
            document.head.append(new DOMParser().parseFromString('<link rel="stylesheet" href="/css/main.css" type="text/css">', 'text/html').head.children[0])
        };
        await fetch("/yiban?r=" + burl) //??????html
            .then(res => res.text())
            .then((text) => {
                document.body.innerHTML = text;
                document.title = "??????????????????";
                document.querySelector("#sendData").addEventListener("click", (e) => {
                    e.currentTarget.setAttribute("disabled", "disabled");
                    app.send().finally(() => document.querySelector("#sendData").removeAttribute("disabled"));
                });
            }).catch(err => console.error(err));
        await fetch("/yiban?r=a") //????????????
            .then(res => res.json())
            .then((json) => {
                for (let i of json) {
                    var div = document.createElement("div");
                    div.innerHTML = i;
                    document.querySelector("#desc").append(div);
                };
            }).catch(err => console.error(err));
        await fetch("/yiban?r=bl") //???????????????
            .then(res => res.json())
            .then(json => app.bl = json).catch(err => console.error(err));
        await fetch("/yiban?r=Amap") //??????Amap_key????????????????????????
            .then(res => res.text())
            .then(text => this.submit = new Submit(text))
            .catch(err => console.error(err));
        var sign_data = tool.getQueryVariable("sign_data"); //???????????????sign_data??????
        if (!sign_data) return;
        try {
            var data = JSON.parse(tool.b64de(decodeURIComponent(sign_data)));
            document.querySelector("#sign_data").value = sign_data;
            document.querySelector("#account").value = data.account;
            document.querySelector("#passwd").value = data.passwd;
            this.submit.maindata.wfid = data.wfid;
            document.querySelector("#sendData").click();
        } catch (err) {
            try {
                var data = JSON.parse(decodeURIComponent(sign_data));
                history.pushState(200, "", window.location.origin + window.location.pathname + "?sign_data=" + encodeURIComponent(tool.b64en(JSON.stringify(data))));
                tool.showinfo([
                    ["text", "sign_data?????????????????????????????????5??????????????????????????????????????????"]
                ]);
                setTimeout(() => {
                    location.reload()
                }, 5000);
            } catch (err) {
                tool.showinfo([
                    ["text", "sign_data?????????????????????????????????????????????????????????????????????"]
                ]);
            };
        };
    },
    send: async function () {
        var lis = document.querySelectorAll("li");
        if (!document.querySelector("#account").value | !document.querySelector("#passwd").value) return tool.showinfo([
            ["text", "???????????????????????????"]
        ]);
        this.submit.addaccount(document.querySelector("#account").value, document.querySelector("#passwd").value);
        if (lis.length > 1) {
            for (let li of lis) this.submit.buildjson(li.id);
            document.querySelector("#sign_data").value = tool.b64en(JSON.stringify(this.submit.fulljson));
        } else if (document.querySelector("#sign_data").value) {
            let post = JSON.parse(tool.b64de(decodeURIComponent(document.querySelector("#sign_data").value)));
            this.submit.submit = JSON.parse(post.submit);
            this.submit.maindata.extra = post.extra;
        };
        this.submit.postdata("/yiban?r=e");
    }
};
window.app=app;