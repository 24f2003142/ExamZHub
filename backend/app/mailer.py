import json
import os
import re
import smtplib
import urllib.request
from datetime import datetime
from email.message import EmailMessage

from flask import current_app


def send_email(to, subject, html):
    config = current_app.config
    if not config["MAIL_SERVER"]:
        outbox = os.path.join(current_app.instance_path, "outbox")
        os.makedirs(outbox, exist_ok=True)
        safe_recipient = re.sub(r"[^a-zA-Z0-9]+", "_", to)
        filename = f"{datetime.now():%Y%m%d-%H%M%S-%f}-{safe_recipient}.html"
        path = os.path.join(outbox, filename)
        with open(path, "w", encoding="utf-8") as output:
            output.write(f"<!-- To: {to} | Subject: {subject} -->\n{html}")
        return "file"

    message = EmailMessage()
    message["From"] = config["MAIL_FROM"]
    message["To"] = to
    message["Subject"] = subject
    message.set_content("Please open this email in an HTML-capable client.")
    message.add_alternative(html, subtype="html")
    with smtplib.SMTP(config["MAIL_SERVER"], config["MAIL_PORT"], timeout=20) as smtp:
        if config["MAIL_USE_TLS"]:
            smtp.starttls()
        if config["MAIL_USER"]:
            smtp.login(config["MAIL_USER"], config["MAIL_PASSWORD"])
        smtp.send_message(message)
    return "smtp"


def post_gchat(text):
    url = current_app.config["GCHAT_WEBHOOK_URL"]
    if not url:
        return False
    request = urllib.request.Request(
        url,
        data=json.dumps({"text": text}).encode(),
        headers={"Content-Type": "application/json; charset=UTF-8"},
    )
    with urllib.request.urlopen(request, timeout=15):
        return True
