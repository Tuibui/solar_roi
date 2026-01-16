from flask import Flask, send_from_directory, jsonify
import os
app = Flask(__name__)
# Path ไปยัง static folder
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
# เสิร์ฟไฟล์ GLB พร้อม MIME type ที่ถูกต้อง
@app.route("/backend/static/<path:filename>")
def serve_static(filename):
    return send_from_directory(STATIC_DIR, filename, mimetype="model/gltf-binary")
# health check
@app.route("/health")
def health():
    return jsonify({"status": "ok"})
if __name__ == "__main__":
    # เปิด server ที่ port 8000
    app.run(host="0.0.0.0", port=8000, debug=True)
