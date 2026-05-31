import time
import logging
import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from celery_worker import celery_app

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")

def send_real_email(to_email, subject, body):
    if not SMTP_USER or not SMTP_PASSWORD:
        logger.error("SMTP_USER or SMTP_PASSWORD not set in environment variables")
        raise ValueError("SMTP credentials missing")
        
    msg = MIMEMultipart()
    msg['From'] = SMTP_USER
    msg['To'] = to_email
    msg['Subject'] = subject
    msg.attach(MIMEText(body, 'plain'))
    
    with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.send_message(msg)


@celery_app.task(bind=True, max_retries=3)
def send_forgot_password_email(self, email, reset_token=None):
    """
    Simulates sending a forgot password email asynchronously.
    """
    logger.info(f"Preparing to send 'Forgot Password' email to {email}")
    try:
        subject = "MoodMirror - Password Reset Request"
        
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5174")
        reset_link = f"{frontend_url}/reset-password?token={reset_token}" if reset_token else f"{frontend_url}/reset-password"
        logger.info(f"Generated reset_link: {reset_link}")
        
        body = f"Hello,\n\nYou have requested to reset your password for MoodMirror.\n\nPlease follow this link to reset it:\n{reset_link}\n\nBest,\nMoodMirror Team"
        send_real_email(email, subject, body)
        logger.info(f"Successfully sent 'Forgot Password' email to {email}")
        return {"status": "success", "email": email, "type": "forgot_password"}
    except Exception as exc:
        logger.error(f"Failed to send email to {email}. Retrying...")
        raise self.retry(exc=exc, countdown=5)

@celery_app.task(bind=True, max_retries=3)
def send_password_reset_email(self, email):
    """
    Simulates sending a password reset confirmation email asynchronously.
    """
    logger.info(f"Preparing to send 'Password Reset' email to {email}")
    try:
        subject = "MoodMirror - Password Reset Successful"
        body = f"Hello,\n\nYour password for MoodMirror has been successfully reset.\n\nBest,\nMoodMirror Team"
        send_real_email(email, subject, body)
        logger.info(f"Successfully sent 'Password Reset' email to {email}")
        return {"status": "success", "email": email, "type": "password_reset"}
    except Exception as exc:
        logger.error(f"Failed to send email to {email}. Retrying...")
        raise self.retry(exc=exc, countdown=5)
