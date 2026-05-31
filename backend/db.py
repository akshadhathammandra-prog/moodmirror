import os
import logging
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
from dotenv import load_dotenv

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DatabaseManager:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(DatabaseManager, cls).__new__(cls)
            cls._instance._init_db()
        return cls._instance

    def _init_db(self):
        self.client = None
        self.db = None
        self.connected = False
        
        uri = os.getenv("MONGODB_URI")
        db_name = os.getenv("MONGODB_DATABASE", "moodmirror")
        
        if not uri:
            logger.warning("MONGODB_URI not found in environment. Database connection will not be established.")
            return
            
        try:
            # Set a short timeout for initial connection to avoid long blocking
            self.client = MongoClient(uri, serverSelectionTimeoutMS=5000)
            # The ismaster command is cheap and does not require auth.
            self.client.admin.command('ismaster')
            self.db = self.client[db_name]
            self.connected = True
            logger.info("Successfully connected to MongoDB.")
        except (ConnectionFailure, ServerSelectionTimeoutError) as e:
            logger.error(f"Failed to connect to MongoDB: {e}")
            self.client = None
            self.db = None
            self.connected = False

    def get_db(self):
        # Attempt to reconnect if not connected
        if not self.connected:
            logger.info("Attempting to reconnect to MongoDB...")
            self._init_db()
        return self.db
        
    def get_collection(self, collection_name):
        db = self.get_db()
        if db is not None:
            return db[collection_name]
        return None

# Export a singleton instance
db_manager = DatabaseManager()

def get_db():
    return db_manager.get_db()

def get_collection(name):
    return db_manager.get_collection(name)
