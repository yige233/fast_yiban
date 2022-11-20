import crypto from "crypto";

class Tool {
    //获取cookie
    static getcookie(cookie, name) {
        let value = "";
        let c = cookie.split(/;|\s/);
        for (let i in c) {
            if (c[i].split("=")[0] == name) {
                value = c[i].split("=")[1]
            };
        };
        return value;
    };
    //加密数据。使用sha-128-cbc
    static encrypt = function (data, key = "123456789", iv = "123456789") {
        const cipher = crypto.createCipheriv('aes-128-cbc', Buffer.from(key), Buffer.from(iv));
        const encryptedData = Buffer.concat([cipher.update(data), cipher.final()]);
        return encryptedData.toString("base64");
    };
    //生成uuid
    static uuid() {
        return crypto.randomUUID().replace(/-/g, "");
    };
};

export default Tool;