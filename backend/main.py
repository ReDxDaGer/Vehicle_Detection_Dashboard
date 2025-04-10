from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime, timedelta
import sqlalchemy
from sqlalchemy import create_engine, Column, Integer, String, DateTime, select, func, desc
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
import os
from typing import List, Optional
from dotenv import load_dotenv
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

app = FastAPI(title="Vehicle Traffic API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database configuration
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "cg")
DB_HOST = os.getenv("DB_HOST", "100.86.199.58")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", 'jaloli')  # Changed to 'jaloli'

DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# Database models
Base = declarative_base()

class VehicleCount(Base):
    __tablename__ = "jaloli_thresholds_detections_counts"  # Changed to match your table name
    
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    camera_id = Column(String)  # Added camera_id field
    auto = Column(Integer, default=0)  # Changed from auto_count
    bus = Column(Integer, default=0)   # Changed from bus_count
    car = Column(Integer, default=0)   # Changed from car_count
    bike = Column(Integer, default=0)  # Changed from bike_count
    truck = Column(Integer, default=0) # Changed from truck_count
    total = Column(Integer, default=0) # Added total field

# Create database engine
try:
    engine = create_engine(DATABASE_URL)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    logger.info("Database connection established successfully")
except Exception as e:
    logger.error(f"Database connection error: {e}")
    raise

# Pydantic models
class VehicleCountResponse(BaseModel):
    timestamp: datetime
    camera_id: str
    car: int
    bike: int
    truck: int
    bus: int
    auto: int
    total: int
    
    class Config:
        orm_mode = True

# Helper function to get database session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/")
def read_root():
    return {
        "message": "Vehicle Traffic API is running", 
        "docs": "/docs", 
        "endpoints": [
            "/api/vehicle-counts/secondly",
            "/api/vehicle-counts/hourly",
            "/api/vehicle-counts/daily"
        ]
    }

@app.get("/api/vehicle-counts/secondly", response_model=List[VehicleCountResponse])
async def get_secondly_data(db: Session = Depends(get_db), camera_id: Optional[str] = None):
    """
    Retrieve vehicle count data for the last minute with 1-second intervals.
    Optional filtering by camera_id.
    """
    try:
        one_minute_ago = datetime.utcnow() - timedelta(minutes=1)
        logger.info(f"Fetching secondly data since {one_minute_ago}")
        
        # Build query
        query = select(VehicleCount).where(
            VehicleCount.timestamp >= one_minute_ago
        )
        
        # Add camera_id filter if provided
        if camera_id:
            query = query.where(VehicleCount.camera_id == camera_id)
            
        # Complete query with ordering and limit
        query = query.order_by(
            VehicleCount.timestamp.desc()
        ).limit(60)  # Max 60 records (1-second intervals in a minute)
        
        results = db.execute(query).scalars().all()
        logger.info(f"Retrieved {len(results)} secondly records")
        
        # If we have fewer than expected records, we'll return what we have
        if len(results) == 0:
            # If no records in the last minute, try to get the most recent ones
            fallback_query = select(VehicleCount)
            
            # Add camera_id filter if provided
            if camera_id:
                fallback_query = fallback_query.where(VehicleCount.camera_id == camera_id)
                
            fallback_query = fallback_query.order_by(
                VehicleCount.timestamp.desc()
            ).limit(60)
            
            results = db.execute(fallback_query).scalars().all()
            logger.info(f"Retrieved {len(results)} fallback secondly records")
        
        return results
    except Exception as e:
        logger.error(f"Error in get_secondly_data: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.get("/api/vehicle-counts/hourly", response_model=List[VehicleCountResponse])
async def get_hourly_data(db: Session = Depends(get_db), camera_id: Optional[str] = None):
    """
    Retrieve today's hourly aggregated vehicle count data.
    Optional filtering by camera_id.
    """
    try:
        # Get the earliest available timestamp today
        base_query = sqlalchemy.text("""
            SELECT MIN(timestamp) FROM "jaloli_thresholds_detections_counts" WHERE timestamp >= CURRENT_DATE
        """)
        
        # Add camera_id filter if provided
        if camera_id:
            base_query = sqlalchemy.text("""
                SELECT MIN(timestamp) FROM "jaloli_thresholds_detections_counts" 
                WHERE timestamp >= CURRENT_DATE AND camera_id = :camera_id
            """)
            min_time_result = db.execute(base_query, {"camera_id": camera_id}).scalar()
        else:
            min_time_result = db.execute(base_query).scalar()

        if min_time_result is None:
            logger.info("No data available for today yet.")
            return []

        start_time = min_time_result  # Start from the earliest entry today
        end_time = datetime.utcnow().replace(minute=0, second=0, microsecond=0)  # Current hour

        logger.info(f"Fetching hourly data from {start_time} to {end_time}")

        # Query to fetch total counts for each hour from the first recorded entry today
        query_text = """
            SELECT 
                date_trunc('hour', timestamp) AS hour,
                camera_id,
                SUM(car) AS car,
                SUM(bike) AS bike,
                SUM(truck) AS truck,
                SUM(bus) AS bus,
                SUM(auto) AS auto,
                SUM(total) AS total
            FROM 
                "jaloli_thresholds_detections_counts"
            WHERE 
                timestamp >= :start_time 
                AND timestamp <= DATE_TRUNC('day', NOW()) + INTERVAL '21 hours'  -- 9 PM of today
        """
        
        # Add camera_id filter if provided
        if camera_id:
            query_text += " AND camera_id = :camera_id"
            
        query_text += """
            GROUP BY 
                hour, camera_id
            ORDER BY 
                hour
        """
        
        query = sqlalchemy.text(query_text)
        
        # Execute query with or without camera_id parameter
        if camera_id:
            result = db.execute(query, {"start_time": start_time, "end_time": end_time, "camera_id": camera_id}).all()
        else:
            result = db.execute(query, {"start_time": start_time, "end_time": end_time}).all()
            
        logger.info(f"Retrieved {len(result)} hourly records")

        # Convert query results into response format
        formatted_results = [
            VehicleCountResponse(
                timestamp=row.hour,
                camera_id=row.camera_id,
                car=int(row.car) if row.car is not None else 0,
                bike=int(row.bike) if row.bike is not None else 0,
                truck=int(row.truck) if row.truck is not None else 0,
                bus=int(row.bus) if row.bus is not None else 0,
                auto=int(row.auto) if row.auto is not None else 0,
                total=int(row.total) if row.total is not None else 0
            ) for row in result
        ]

        return formatted_results

    except Exception as e:
        logger.error(f"Error in get_hourly_data: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.get("/api/vehicle-counts/daily", response_model=List[VehicleCountResponse])
async def get_daily_data(
    db: Session = Depends(get_db),
    interval_minutes: Optional[int] = 10,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    camera_id: Optional[str] = None
):
    """
    Retrieve total vehicle count data for a specific date range directly from the database.
    Parameters:
    - interval_minutes: Interval in minutes for data aggregation (default: 10)
    - start_date: Start date in ISO format (YYYY-MM-DD), defaults to yesterday
    - end_date: End date in ISO format (YYYY-MM-DD), defaults to yesterday
    - camera_id: Optional camera ID to filter results
    """
    try:
        # Parse date parameters with validation
        try:
            if start_date:
                start_datetime = datetime.fromisoformat(start_date)
            else:
                start_datetime = datetime.utcnow() - timedelta(days=1)  # Default to yesterday
            
            start_datetime = start_datetime.replace(hour=0, minute=0, second=0, microsecond=0)

            if end_date:
                end_datetime = datetime.fromisoformat(end_date)
            else:
                end_datetime = start_datetime  # Keep same day

            # Set end of day for end_datetime
            end_datetime = end_datetime.replace(hour=23, minute=59, second=59, microsecond=999999)
        
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

        # Validate interval (minimum 1 minute, maximum 60 minutes)
        if interval_minutes < 1 or interval_minutes > 60:
            interval_minutes = 10  # Default to 10 minutes if out of range

        logger.info(f"Fetching daily data from {start_datetime} to {end_datetime} with {interval_minutes}-minute intervals")

        # Use a fresh database session to avoid transaction issues
        session = SessionLocal()

        try:
            # Build query text with camera_id filter if provided
            query_text = f"""
                SELECT 
                    date_trunc('hour', timestamp) + 
                    (FLOOR(EXTRACT(minute FROM timestamp) / :interval) * :interval * interval '1 minute') AS time_bucket,
                    camera_id,
                    SUM(car) AS car,
                    SUM(bike) AS bike,
                    SUM(truck) AS truck,
                    SUM(bus) AS bus,
                    SUM(auto) AS auto,
                    SUM(total) AS total
                FROM 
                    "jaloli_thresholds_detections_counts"
                WHERE 
                    timestamp >= :start_time AND timestamp <= :end_time
            """
            
            # Add camera_id filter if provided
            if camera_id:
                query_text += " AND camera_id = :camera_id"
                
            query_text += """
                GROUP BY 
                    time_bucket, camera_id
                ORDER BY 
                    time_bucket
            """
            
            query = sqlalchemy.text(query_text)
            
            # Execute with or without camera_id parameter
            params = {
                "interval": interval_minutes, 
                "start_time": start_datetime, 
                "end_time": end_datetime
            }
            
            if camera_id:
                params["camera_id"] = camera_id
                
            result = session.execute(query, params).all()

            logger.info(f"Retrieved {len(result)} daily aggregated records directly from database")

            # Convert to response format
            formatted_results = [
                VehicleCountResponse(
                    timestamp=row.time_bucket,
                    camera_id=row.camera_id,
                    car=int(row.car) if row.car is not None else 0,
                    bike=int(row.bike) if row.bike is not None else 0,
                    truck=int(row.truck) if row.truck is not None else 0,
                    bus=int(row.bus) if row.bus is not None else 0,
                    auto=int(row.auto) if row.auto is not None else 0,
                    total=int(row.total) if row.total is not None else 0
                ) for row in result
            ]

            return formatted_results

        except Exception as e:
            session.rollback()
            logger.error(f"SQL error in daily data: {str(e)}")
            raise HTTPException(status_code=500, detail="Database query failed")

        finally:
            session.close()

    except Exception as outer_e:
        logger.error(f"Error in get_daily_data: {str(outer_e)}")
        raise HTTPException(status_code=500, detail="Processing error")

@app.get("/api/vehicle-counts/last-hour")
async def get_last_hour_summary(db: Session = Depends(get_db), camera_id: Optional[str] = None):
    """
    Get total vehicle counts for the last hour.
    Optional filtering by camera_id.
    """
    try:
        one_hour_ago = datetime.utcnow() - timedelta(hours=1)

        # Build query
        total_query = select(
            func.sum(VehicleCount.car).label("total_cars"),
            func.sum(VehicleCount.bike).label("total_bikes"),
            func.sum(VehicleCount.truck).label("total_trucks"),
            func.sum(VehicleCount.bus).label("total_buses"),
            func.sum(VehicleCount.auto).label("total_autos"),
            func.sum(VehicleCount.total).label("total_vehicles")
        ).where(VehicleCount.timestamp >= one_hour_ago)

        # Add camera_id filter if provided
        if camera_id:
            total_query = total_query.where(VehicleCount.camera_id == camera_id)

        total_counts = db.execute(total_query).first()

        return {
            "hourly_totals": {
                "cars": total_counts.total_cars or 0,
                "bikes": total_counts.total_bikes or 0,
                "trucks": total_counts.total_trucks or 0,
                "buses": total_counts.total_buses or 0,
                "autos": total_counts.total_autos or 0,
                "total": total_counts.total_vehicles or 0
            }
        }

    except Exception as e:
        logger.error(f"Error in get_last_hour_summary: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.get("/api/vehicle-counts/summary")
async def get_summary(
    db: Session = Depends(get_db),
    start_date: Optional[str] = None,
    camera_id: Optional[str] = None
):
    """
    Get summary statistics for vehicle counts directly from the database.
    
    Parameters:
    - start_date: Date in ISO format (YYYY-MM-DD), defaults to today
    - camera_id: Optional camera ID to filter results
    """
    try:
        # Determine the date to fetch summary for
        if start_date:
            try:
                today_start = datetime.fromisoformat(start_date)
                today_start = today_start.replace(hour=0, minute=0, second=0, microsecond=0)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
        else:
            today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        
        today_end = today_start.replace(hour=23, minute=59, second=59, microsecond=999999)
        
        # Build the query base
        query_text = """
            SELECT
                COALESCE(SUM(car), 0) AS total_cars,
                COALESCE(SUM(bike), 0) AS total_bikes,
                COALESCE(SUM(truck), 0) AS total_trucks,
                COALESCE(SUM(bus), 0) AS total_buses,
                COALESCE(SUM(auto), 0) AS total_autos,
                COALESCE(SUM(total), 0) AS total_all,
                COUNT(id) AS record_count
            FROM
                "jaloli_thresholds_detections_counts"
            WHERE
                timestamp >= :today_start AND timestamp <= :today_end
        """
        
        # Add camera_id filter if provided
        params = {
            "today_start": today_start,
            "today_end": today_end
        }
        
        if camera_id:
            query_text += " AND camera_id = :camera_id"
            params["camera_id"] = camera_id
            
        totals_query = sqlalchemy.text(query_text)
        result = db.execute(totals_query, params).one()
        
        # Build peak hour query
        peak_hour_query_text = """
            SELECT
                date_trunc('hour', timestamp) AS hour,
                AVG(total) AS hourly_avg
            FROM
                "jaloli_thresholds_detections_counts"
            WHERE
                timestamp >= :today_start AND timestamp <= :today_end
        """
        
        # Add camera_id filter if provided
        if camera_id:
            peak_hour_query_text += " AND camera_id = :camera_id"
            
        peak_hour_query_text += """
            GROUP BY
                hour
            ORDER BY
                hourly_avg DESC
            LIMIT 1
        """
        
        peak_hour_query = sqlalchemy.text(peak_hour_query_text)
        peak_hour_result = db.execute(peak_hour_query, params).first()
        
        peak_hour = peak_hour_result.hour.strftime('%H:%M') if peak_hour_result else None
        peak_count = round(peak_hour_result.hourly_avg) if peak_hour_result and peak_hour_result.hourly_avg else 0
        
        # Use the total field directly instead of calculating
        total_vehicles = result.total_all
        
        return {
            "date": today_start.date().isoformat(),
            "total_vehicles": {
                "cars": round(result.total_cars),
                "bikes": round(result.total_bikes),
                "trucks": round(result.total_trucks),
                "buses": round(result.total_buses),
                "autos": round(result.total_autos),
                "all": round(total_vehicles)
            },
            "peak_hour": peak_hour,
            "peak_hour_count": peak_count,
            "record_count": result.record_count
        }
    except Exception as e:
        logger.error(f"Error in get_summary: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.get("/api/cameras")
async def get_cameras(db: Session = Depends(get_db)):
    """
    Get list of all available camera IDs in the system
    """
    try:
        query = sqlalchemy.text("""
            SELECT DISTINCT camera_id 
            FROM "jaloli_thresholds-detections-counts" 
            ORDER BY camera_id
        """)
        
        results = db.execute(query).all()
        camera_ids = [row[0] for row in results]
        
        return {
            "cameras": camera_ids,
            "count": len(camera_ids)
        }
    except Exception as e:
        logger.error(f"Error in get_cameras: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)