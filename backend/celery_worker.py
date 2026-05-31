import os
from celery import Celery
from dotenv import load_dotenv

load_dotenv()

def make_celery(app_name=__name__):
    broker_url = os.getenv("CELERY_BROKER_URL", "amqp://guest:guest@localhost:5672//")
    
    celery = Celery(
        app_name,
        broker=broker_url
    )
    
    celery.conf.update(
        task_serializer="json",
        accept_content=["json"],
        result_serializer="json",
        timezone="UTC",
        enable_utc=True,
        imports=["tasks"]
    )
    return celery

celery_app = make_celery()
