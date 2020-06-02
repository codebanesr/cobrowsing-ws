const dotenv = require('dotenv');


dotenv.config()

const presigned = () => {
  var v4 = require("aws-signature-v4");
  var url = v4.createPresignedS3URL("myfileupload", {
    region: 'us-west-2', 
    expires: 3600,
    method: 'PUT',
    headers: {
      'x-amz-acl': 'public-read' // set the uploaded file ACL to public-read
    }
  });


  console.log(url)
  return url;
};



presigned()
// module.exports = presigned;