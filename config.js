const
  //port是程序运行的端口
  port = 4500,

  //app_key和app_secret_code用于加载地图选点组件，获取方法见https://lbs.amap.com/api/javascript-api/guide/abc/prepare，网页中提到的Key即是app_key，安全密钥即是app_secret_code
  app_key = "",
  app_secret_code = "",

  //允许保存的图片的最大大小,单位为B（字节）。下面是10MB。
  maxImgSize = 1024 * 1024 * 10,

  //可以上传到易班服务器的文件类型-图片
  allowedImage = ["image/png", "image/jpg", "image/jpeg"],

  //可以上传到易班服务器的文件类型-文件
  allowedFile = [
    "application/vnd.ms-excel",
    "application/wps-office.xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/wps-office.xlsx",
    "application/msword",
    "application/wps-office.doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/wps-office.docx",
    "application/pdf",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain"
  ];

export {
  port,
  app_key,
  app_secret_code,
  maxImgSize,
  allowedImage,
  allowedFile
};