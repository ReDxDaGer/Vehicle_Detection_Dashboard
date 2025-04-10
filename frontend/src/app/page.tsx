"use client";

import React, { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
);

// Define the data type for vehicle counts - updated to match API response format
type VehicleCount = {
  timestamp: string;
  camera_id: string;
  car: number;      // Changed from car_count
  bike: number;     // Changed from bike_count
  truck: number;    // Changed from truck_count
  bus: number;      // Changed from bus_count
  auto: number;     // Changed from auto_count
  total: number;    // Added total field from API
};

// New interface for real-time stats
type CurrentStats = {
  cars: number;
  bikes: number;
  trucks: number;
  buses: number;
  autos: number;
  lastUpdated: string;
  prevStats?: {
    cars: number;
    bikes: number;
    trucks: number;
    buses: number;
    autos: number;
  };
};

const App = () => {
  const [secondlyData, setSecondlyData] = useState<VehicleCount[]>([]);
  const [hourlyData, setHourlyData] = useState<VehicleCount[]>([]);
  const [dailyData, setDailyData] = useState<VehicleCount[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [hourlyTotals, setHourlyTotals] = useState({
    cars: 0,
    bikes: 0,
    trucks: 0,
    buses: 0,
    autos: 0
  });
  
  // Real-time accumulated stats
  const [realtimeTotals, setRealtimeTotals] = useState({
    cars: 0,
    bikes: 0,
    trucks: 0,
    buses: 0,
    autos: 0
  });
  
  // Real-time stats with trend tracking
  const [currentStats, setCurrentStats] = useState<CurrentStats>({
    cars: 0,
    bikes: 0,
    trucks: 0,
    buses: 0,
    autos: 0,
    lastUpdated: '',
    prevStats: {
      cars: 0,
      bikes: 0,
      trucks: 0,
      buses: 0,
      autos: 0,
    }
  });
  
  // Function to update stats with trend tracking
  const updateStats = (newStats: Omit<CurrentStats, 'prevStats' | 'lastUpdated'>) => {
    setCurrentStats(prevState => ({
      ...newStats,
      lastUpdated: new Date().toLocaleTimeString(),
      prevStats: {
        cars: prevState.cars,
        bikes: prevState.bikes,
        trucks: prevState.trucks,
        buses: prevState.buses,
        autos: prevState.autos
      }
    }));
  };
  
  // Fetch data periodically
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        
        // Fetch per-second data
        try {
          const secondlyResponse = await fetch('http://localhost:8000/api/vehicle-counts/secondly');
          if (!secondlyResponse.ok) {
            console.error(`Secondly data fetch failed with status: ${secondlyResponse.status}`);
          } else {
            const secondlyResponseData = await secondlyResponse.json();
            if (Array.isArray(secondlyResponseData)) {
              setSecondlyData(secondlyResponseData);
              
              // Update the current stats with the latest data point
              if (secondlyResponseData.length > 0) {
                const latestData = secondlyResponseData[0]; // Assuming newest data is first
                updateStats({
                  cars: latestData.car || 0,  // Changed from car_count to car
                  bikes: latestData.bike || 0, // Changed from bike_count to bike
                  trucks: latestData.truck || 0, // Changed from truck_count to truck
                  buses: latestData.bus || 0, // Changed from bus_count to bus
                  autos: latestData.auto || 0, // Changed from auto_count to auto
                });
                
                // Update realtime accumulated totals
                setRealtimeTotals(prevTotals => {
                  // Check if this data is already counted to avoid duplicate counting
                  const isNewData = !secondlyData.some(item => 
                    item.timestamp === latestData.timestamp && 
                    item.camera_id === latestData.camera_id
                  );
                  
                  if (isNewData) {
                    return {
                      cars: prevTotals.cars + (latestData.car || 0),
                      bikes: prevTotals.bikes + (latestData.bike || 0),
                      trucks: prevTotals.trucks + (latestData.truck || 0),
                      buses: prevTotals.buses + (latestData.bus || 0),
                      autos: prevTotals.autos + (latestData.auto || 0)
                    };
                  }
                  return prevTotals;
                });
              }
            } else {
              console.error("Secondly data is not an array:", secondlyResponseData);
              setSecondlyData([]);
            }
          }
        } catch (err) {
          console.error("Error fetching secondly data:", err);
          // Don't clear existing data on error - keep displaying last known data
        }
        
        // Fetch hourly data
        try {
          const hourlyResponse = await fetch('http://localhost:8000/api/vehicle-counts/hourly');
          if (!hourlyResponse.ok) {
            console.error(`Hourly data fetch failed with status: ${hourlyResponse.status}`);
          } else {
            const hourlyResponseData = await hourlyResponse.json();
            if (Array.isArray(hourlyResponseData)) {
              setHourlyData(hourlyResponseData);
            } else {
              console.error("Hourly data is not an array:", hourlyResponseData);
            }
          }
        } catch (err) {
          console.error("Error fetching hourly data:", err);
          // Don't clear existing data on error
        }
        
        // Fetch daily data
        try {
          const dailyResponse = await fetch('http://localhost:8000/api/vehicle-counts/daily');
          if (!dailyResponse.ok) {
            console.error(`Daily data fetch failed with status: ${dailyResponse.status}`);
          } else {
            const dailyResponseData = await dailyResponse.json();
            if (Array.isArray(dailyResponseData)) {
              setDailyData(dailyResponseData);
            } else {
              console.error("Daily data is not an array:", dailyResponseData);
            }
          }
        } catch (err) {
          console.error("Error fetching daily data:", err);
          // Don't clear existing data on error
        }
        
        // Fetch hourly summary for stats cards
        try {
          const hourlySummaryResponse = await fetch('http://localhost:8000/api/vehicle-counts/last-hour');
          if (!hourlySummaryResponse.ok) {
            console.error(`Hourly summary fetch failed with status: ${hourlySummaryResponse.status}`);
          } else {
            const hourlySummaryData = await hourlySummaryResponse.json();
            setHourlyTotals(hourlySummaryData.hourly_totals); // Update state with hourly totals
          }
        } catch (err) {
          console.error("Error fetching hourly summary:", err);
        }
        
        setLastUpdated(new Date().toLocaleTimeString());
        setIsLoading(false);
        setError(null);
      } catch (err) {
        console.error("General fetch error:", err);
        setIsLoading(false);
        // Only set error if we don't have any data to display
        if (secondlyData.length === 0 && hourlyData.length === 0 && dailyData.length === 0) {
          setError('Failed to fetch data. Please check your connection.');
        }
      }
    };
    
    // Initial fetch
    fetchData();
    
    // Set up interval for updating data every second
    const intervalId = setInterval(fetchData, 1000);
    
    // Clean up interval on component unmount
    return () => clearInterval(intervalId);
  }, []);
  
  // Chart options and configuration
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          maxRotation: 45,
          minRotation: 45
        }
      },
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(255, 255, 255, 0.1)'
        }
      },
    },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          boxWidth: 15,
          usePointStyle: true,
          pointStyle: 'circle',
          color: 'white'
        },
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        bodyFont: {
          size: 13,
        },
        titleFont: {
          size: 14,
          weight: 'bold' as const,
        },
        callbacks: {
          label: function(context: any) {
            return ` ${context.dataset.label}: ${context.raw} vehicles`;
          }
        }
      },
      title: {
        display: true,
        color: 'white',
        font: {
          size: 16
        }
      }
    },
    animation: {
      duration: 500,
      easing: 'easeInOutQuart' as const
    },
  };

  // Specific options for line chart
  const lineChartOptions = {
    ...chartOptions,
    elements: {
      line: {
        tension: 0.3, // Adds a slight curve to lines
      },
      point: {
        radius: 3,
        hoverRadius: 6
      }
    }
  };
  
  // Process secondly data for per-second visualization
  const processSecondlyData = (data: VehicleCount[]): VehicleCount[] => {
    if (!Array.isArray(data) || data.length === 0) {
      return [];
    }
    
    // Take only the latest 30 seconds of data for better visualization
    return [...data].sort((a, b) => {
      if (!a || !b || !a.timestamp || !b.timestamp) {
        return 0;
      }
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    }).slice(-30);
  };
  
  // Process hourly data to show only the last 10 hours
  const processHourlyData = (data: VehicleCount[]): VehicleCount[] => {
    if (!Array.isArray(data) || data.length === 0) {
      return [];
    }
    
    // Take only the latest 10 hours of data for better visualization
    return [...data].sort((a, b) => {
      if (!a || !b || !a.timestamp || !b.timestamp) {
        return 0;
      }
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    }).slice(-10);
  };
  
  // Get processed data
  const processedSecondlyData = processSecondlyData(secondlyData);
  const processedHourlyData = processHourlyData(hourlyData);
  
  // Process data for per-second line chart
  const secondlyLineChartData = {
    labels: processedSecondlyData.map(item => {
      try {
        const date = new Date(item.timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      } catch (err) {
        console.error("Error formatting timestamp:", err);
        return "Invalid";
      }
    }),
    datasets: [
      {
        label: 'Cars',
        data: processedSecondlyData.map(item => item.car || 0),  // Changed from car_count
        backgroundColor: 'rgba(54, 162, 235, 0.2)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 2,
        fill: false,
      },
      {
        label: 'Bikes',
        data: processedSecondlyData.map(item => item.bike || 0),  // Changed from bike_count
        backgroundColor: 'rgba(255, 99, 132, 0.2)',
        borderColor: 'rgba(255, 99, 132, 1)',
        borderWidth: 2,
        fill: false,
      },
      {
        label: 'Trucks',
        data: processedSecondlyData.map(item => item.truck || 0),  // Changed from truck_count
        backgroundColor: 'rgba(255, 206, 86, 0.2)',
        borderColor: 'rgba(255, 206, 86, 1)',
        borderWidth: 2,
        fill: false,
      },
      {
        label: 'Buses',
        data: processedSecondlyData.map(item => item.bus || 0),  // Changed from bus_count
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 2,
        fill: false,
      },
      {
        label: 'Autos',
        data: processedSecondlyData.map(item => item.auto || 0),  // Changed from auto_count
        backgroundColor: 'rgba(153, 102, 255, 0.2)',
        borderColor: 'rgba(153, 102, 255, 1)',
        borderWidth: 2,
        fill: false,
      },
    ],
  };
  
  // Process data for hourly chart - using the processed data that only includes last 10 hours
  const hourlyChartData = {
    labels: processedHourlyData.map(item => {
      try {
        const date = new Date(item.timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch (err) {
        return "Invalid";
      }
    }),
    datasets: [
      {
        label: 'Cars',
        data: processedHourlyData.map(item => item.car || 0),  // Changed from car_count
        backgroundColor: 'rgba(54, 162, 235, 0.8)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1,
      },
      {
        label: 'Bikes',
        data: processedHourlyData.map(item => item.bike || 0),  // Changed from bike_count
        backgroundColor: 'rgba(255, 99, 132, 0.8)',
        borderColor: 'rgba(255, 99, 132, 1)',
        borderWidth: 1,
      },
      {
        label: 'Trucks',
        data: processedHourlyData.map(item => item.truck || 0),  // Changed from truck_count
        backgroundColor: 'rgba(255, 206, 86, 0.8)',
        borderColor: 'rgba(255, 206, 86, 1)',
        borderWidth: 1,
      },
      {
        label: 'Buses',
        data: processedHourlyData.map(item => item.bus || 0),  // Changed from bus_count
        backgroundColor: 'rgba(75, 192, 192, 0.8)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 1,
      },
      {
        label: 'Autos',
        data: processedHourlyData.map(item => item.auto || 0),  // Changed from auto_count
        backgroundColor: 'rgba(153, 102, 255, 0.8)',
        borderColor: 'rgba(153, 102, 255, 1)',
        borderWidth: 1,
      },
    ],
  };
  
  // Process data for daily chart
  const dailyChartData = {
    labels: (Array.isArray(dailyData) ? dailyData : []).map(item => {
      try {
        const date = new Date(item.timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch (err) {
        return "Invalid";
      }
    }),
    datasets: [
      {
        label: 'Cars',
        data: (Array.isArray(dailyData) ? dailyData : []).map(item => item.car || 0),  // Changed from car_count
        backgroundColor: 'rgba(54, 162, 235, 0.8)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1,
      },
      {
        label: 'Bikes',
        data: (Array.isArray(dailyData) ? dailyData : []).map(item => item.bike || 0),  // Changed from bike_count
        backgroundColor: 'rgba(255, 99, 132, 0.8)',
        borderColor: 'rgba(255, 99, 132, 1)',
        borderWidth: 1,
      },
      {
        label: 'Trucks',
        data: (Array.isArray(dailyData) ? dailyData : []).map(item => item.truck || 0),  // Changed from truck_count
        backgroundColor: 'rgba(255, 206, 86, 0.8)',
        borderColor: 'rgba(255, 206, 86, 1)',
        borderWidth: 1,
      },
      {
        label: 'Buses',
        data: (Array.isArray(dailyData) ? dailyData : []).map(item => item.bus || 0),  // Changed from bus_count
        backgroundColor: 'rgba(75, 192, 192, 0.8)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 1,
      },
      {
        label: 'Autos',
        data: (Array.isArray(dailyData) ? dailyData : []).map(item => item.auto || 0),  // Changed from auto_count
        backgroundColor: 'rgba(153, 102, 255, 0.8)',
        borderColor: 'rgba(153, 102, 255, 1)',
        borderWidth: 1,
      },
    ],
  };

  // Calculate total counts for each vehicle type
  const calculateTotals = (data: VehicleCount[] | null | undefined) => {
    if (!Array.isArray(data) || data.length === 0) {
      return {
        cars: 0,
        bikes: 0,
        trucks: 0,
        buses: 0,
        autos: 0,
      };
    }
    
    try {
      return {
        cars: data.reduce((sum, item) => sum + (item?.car || 0), 0),  // Changed from car_count
        bikes: data.reduce((sum, item) => sum + (item?.bike || 0), 0),  // Changed from bike_count
        trucks: data.reduce((sum, item) => sum + (item?.truck || 0), 0),  // Changed from truck_count
        buses: data.reduce((sum, item) => sum + (item?.bus || 0), 0),  // Changed from bus_count
        autos: data.reduce((sum, item) => sum + (item?.auto || 0), 0),  // Changed from auto_count
      };
    } catch (err) {
      console.error("Error calculating totals:", err);
      return {
        cars: 0,
        bikes: 0,
        trucks: 0,
        buses: 0,
        autos: 0,
      };
    }
  };

  const secondlyTotals = calculateTotals(secondlyData);
  const hourlyDataTotals = calculateTotals(processedHourlyData); // Renamed to avoid confusion with hourlyTotals state
  const dailyTotals = calculateTotals(dailyData);

  // Calculate total vehicles
  const getTotalVehicles = (totals: { cars: number, bikes: number, trucks: number, buses: number, autos: number }) => {
    return Object.values(totals).reduce((a, b) => a + b, 0);
  };

  // Function to determine trend
  const getTrend = (current: number, previous: number): 'up' | 'down' | 'none' => {
    if (current > previous) return 'up';
    if (current < previous) return 'down';
    return 'none';
  };

  // Function to create animated number display with counter effect
  const AnimatedCounter = ({ value, trend }: { value: number, trend: 'up' | 'down' | 'none' }) => {
    let trendIcon = null;
    if (trend === 'up') {
      trendIcon = <span className="text-green-400 ml-2">↑</span>;
    } else if (trend === 'down') {
      trendIcon = <span className="text-red-400 ml-2">↓</span>;
    }
    
    return (
      <div className="flex items-center justify-center">
        <span className="text-3xl font-bold transition-all duration-300">{value}</span>
        {trendIcon}
      </div>
    );
  };

  // Function to handle real-time data animation
  const AnimatedValue = ({ value, previousValue }: { value: number, previousValue: number }) => {
    const isIncreasing = value > previousValue;
    const isDecreasing = value < previousValue;
    
    return (
      <span className={`
        inline-block transition-all duration-300
        ${isIncreasing ? 'text-green-400 scale-110' : ''}
        ${isDecreasing ? 'text-red-400 scale-90' : ''}
      `}>
        {value}
      </span>
    );
  };

  return (
    <div className="bg-gray-900 text-white min-h-screen p-6">
      <header className="mb-6">
        <div className="flex items-center justify-between">
          {/* Logo space */}
          <div className="w-16 h-16 bg-gray-800 rounded-full mr-4 flex items-center justify-center">
            <span className="text-cyan-300 text-xl font-bold">
              <img src="final.png" alt="Logo" className="h-full w-full object-cover rounded-full" />
            </span>
          </div>
          
          {/* Dashboard title */}
          <div className="flex-1">
            <h1 className="text-4xl font-bold mb-2 text-cyan-300">Tritiyaeye's ATCC Dashboard</h1>
            <p className="text-gray-400">Automated Traffic Counting and Classification System</p>
            <p className="text-gray-400">Jaloli Toll Plaza, Panchkula, Traffic Analytics</p>
          </div>
        </div>
        
        <div className="flex justify-between items-center mt-4">
          <span className="text-gray-400">
            Last updated: {lastUpdated || 'Never'}
          </span>
          <div className="flex items-center gap-2">
            {isLoading && (
              <span className="text-blue-400 flex items-center">
                <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Updating...
              </span>
            )}
          </div>
        </div>
      </header>
      
      {error && (
        <div className="bg-red-800 text-white p-4 mb-6 rounded">
          {error}
        </div>
      )}

      {/* Stats cards - showing real-time accumulated data */}
      {/* <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-blue-800 rounded-lg shadow-lg p-4 flex flex-col items-center">
          <h3 className="text-lg font-medium mb-1">Cars (Real-time Total)</h3>
          <AnimatedCounter 
            value={realtimeTotals.cars} 
            trend={getTrend(realtimeTotals.cars, currentStats.prevStats?.cars || 0)} 
          />
        </div>
        <div className="bg-pink-800 rounded-lg shadow-lg p-4 flex flex-col items-center">
          <h3 className="text-lg font-medium mb-1">Bikes (Real-time Total)</h3>
          <AnimatedCounter 
            value={realtimeTotals.bikes} 
            trend={getTrend(realtimeTotals.bikes, currentStats.prevStats?.bikes || 0)} 
          />
        </div>
        <div className="bg-yellow-700 rounded-lg shadow-lg p-4 flex flex-col items-center">
          <h3 className="text-lg font-medium mb-1">Trucks (Real-time Total)</h3>
          <AnimatedCounter 
            value={realtimeTotals.trucks} 
            trend={getTrend(realtimeTotals.trucks, currentStats.prevStats?.trucks || 0)} 
          />
        </div>
        <div className="bg-teal-800 rounded-lg shadow-lg p-4 flex flex-col items-center">
          <h3 className="text-lg font-medium mb-1">Buses (Real-time Total)</h3>
          <AnimatedCounter 
            value={realtimeTotals.buses} 
            trend={getTrend(realtimeTotals.buses, currentStats.prevStats?.buses || 0)} 
          />
        </div>
        <div className="bg-purple-800 rounded-lg shadow-lg p-4 flex flex-col items-center">
          <h3 className="text-lg font-medium mb-1">Autos (Real-time Total)</h3>
          <AnimatedCounter 
            value={realtimeTotals.autos} 
            trend={getTrend(realtimeTotals.autos, currentStats.prevStats?.autos || 0)} 
          />
        </div>
      </div> */}
      
      {/* Latest Data Counts - New section for real-time values */}
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-6">
        <h2 className="text-2xl font-bold mb-4 text-center">Latest Vehicle Counts</h2>
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-blue-900/50 rounded p-4 text-center">  
            <h3 className="text-blue-300 mb-2">Cars</h3>
            <AnimatedValue 
              value={currentStats.cars} 
              previousValue={currentStats.prevStats?.cars || 0} 
            />
          </div>
          <div className="bg-pink-900/50 rounded p-4 text-center">
            <h3 className="text-pink-300 mb-2">Bikes</h3>
            <AnimatedValue 
              value={currentStats.bikes} 
              previousValue={currentStats.prevStats?.bikes || 0} 
            />
          </div>
          <div className="bg-yellow-900/50 rounded p-4 text-center">
            <h3 className="text-yellow-300 mb-2">Trucks</h3>
            <AnimatedValue 
              value={currentStats.trucks} 
              previousValue={currentStats.prevStats?.trucks || 0} 
            />
          </div>
          <div className="bg-teal-900/50 rounded p-4 text-center">
            <h3 className="text-teal-300 mb-2">Buses</h3>
            <AnimatedValue 
              value={currentStats.buses} 
              previousValue={currentStats.prevStats?.buses || 0} 
            />
            </div>
            <div className="bg-purple-900/50 rounded p-4 text-center">
              <h3 className="text-purple-300 mb-2">Autos</h3>
              <AnimatedValue 
                value={currentStats.autos} 
                previousValue={currentStats.prevStats?.autos || 0} 
              />
            </div>
            </div>
            <p className="text-gray-400 text-center mt-2">Last updated: {currentStats.lastUpdated}</p>
            </div>
            
            {/* Real-time chart */}
            <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-6">
              <h2 className="text-2xl font-bold mb-4">Real-time Vehicle Detection</h2>
              <div className="h-96">
                {processedSecondlyData.length > 0 ? (
                  <Line options={{...lineChartOptions, plugins: {...lineChartOptions.plugins, title: {
                    ...lineChartOptions.plugins.title,
                    text: 'Per-Second Vehicle Count (Last 30 seconds)'
                  }}}} data={secondlyLineChartData} />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-gray-400">No real-time data available</p>
                  </div>
                )}
              </div>
            </div>
            
            {/* Hourly chart */}
            <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-6">
              <h2 className="text-2xl font-bold mb-4">Hourly Traffic Analysis</h2>
              <div className="h-96">
                {processedHourlyData.length > 0 ? (
                  <Bar options={{...chartOptions, plugins: {...chartOptions.plugins, title: {
                    ...chartOptions.plugins.title,
                    text: 'Hourly Vehicle Count (Last 10 hours)'
                  }}}} data={hourlyChartData} />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-gray-400">No hourly data available</p>
                  </div>
                )}
              </div>
            </div>
            
            {/* Daily chart */}
            <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-6">
              <h2 className="text-2xl font-bold mb-4">Daily Traffic Patterns</h2>
              <div className="h-96">
                {dailyData.length > 0 ? (
                  <Bar options={{...chartOptions, plugins: {...chartOptions.plugins, title: {
                    ...chartOptions.plugins.title,
                    text: 'Daily Vehicle Count'
                  }}}} data={dailyChartData} />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-gray-400">No daily data available</p>
                  </div>
                )}
              </div>
            </div>
            
            {/* Traffic summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                <h2 className="text-2xl font-bold mb-4">Hourly Traffic Summary</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-700 p-4 rounded">
                    <h3 className="text-lg font-medium mb-2">Total Vehicles (Whole Day)</h3>
                    <p className="text-3xl font-bold">{getTotalVehicles(hourlyTotals)}</p>
                  </div>
                  {/* <div className="bg-gray-700 p-4 rounded">
                    <h3 className="text-lg font-medium mb-2">Most Common</h3>
                    <p className="text-3xl font-bold">
                      {Object.entries(hourlyTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || 'None'}
                    </p>
                  </div> */}
                </div>
                
                <div className="mt-4">
                  <h3 className="text-lg font-medium mb-2">Vehicle Distribution (Last Hour)</h3>
                  <div className="grid grid-cols-5 gap-2">
                    <div className="text-center">
                      <div className="h-2 bg-blue-500 rounded-full"></div>
                      <p className="mt-1 text-sm">Cars: {hourlyTotals.cars}</p>
                    </div>
                    <div className="text-center">
                      <div className="h-2 bg-pink-500 rounded-full"></div>
                      <p className="mt-1 text-sm">Bikes: {hourlyTotals.bikes}</p>
                    </div>
                    <div className="text-center">
                      <div className="h-2 bg-yellow-500 rounded-full"></div>
                      <p className="mt-1 text-sm">Trucks: {hourlyTotals.trucks}</p>
                    </div>
                    <div className="text-center">
                      <div className="h-2 bg-teal-500 rounded-full"></div>
                      <p className="mt-1 text-sm">Buses: {hourlyTotals.buses}</p>
                    </div>
                    <div className="text-center">
                      <div className="h-2 bg-purple-500 rounded-full"></div>
                      <p className="mt-1 text-sm">Autos: {hourlyTotals.autos}</p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                <h2 className="text-2xl font-bold mb-4">System Information</h2>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>API Status:</span>
                    <span className="text-green-400">Online</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Camera Status:</span>
                    <span className="text-green-400">Connected</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Data Source:</span>
                    <span>Jaloli Toll Plaza, Panchkula</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Detection Model:</span>
                    <span>Tritiyaeye Detection Model</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Data Processing:</span>
                    <span>Real-time</span>
                  </div>
                </div>
              </div>
            </div>
            
            <footer className="text-center text-gray-500 mt-10 pb-4">
              <p>© 2025 Tritiyaeye Technologies. All rights reserved.</p>
              <p className="text-sm mt-1">Automated Traffic Counting and Classification System</p>
            </footer>
            </div>
              );
            };
            
            export default App;