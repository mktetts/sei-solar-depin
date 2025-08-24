from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from fastmcp import FastMCP
import sys
import os
import httpx
import asyncio
import math

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from blockchain import blockchain

# Request models
class BuyPowerRequest(BaseModel):
    user_address: str
    station_id: int
    watt: float  # Accept float for decimal support
    power: float  # Accept float for decimal support
    
# EmergencyStopRequest removed - emergency_stop_charging now requires NO parameters

class PrebookRequest(BaseModel):
    user_address: str
    station_id: int
    watt: float  # Accept float for decimal support
    power: float  # Accept float for decimal support

class CompleteChargingRequest(BaseModel):
    user_address: str
    station_id: int
    watt: float  # Accept float for decimal support
    power: float  # Accept float for decimal support
    charging_duration_seconds: int = 5

def register_charging_booking_tools(mcp: FastMCP):
    """Register all ChargingBooking contract tools."""
    
    # Scale factor for decimal conversion (3 decimal places)
    SCALE_FACTOR = 1000
    
    def scale_to_contract(value: float) -> int:
        """Convert decimal value to scaled integer for contract storage."""
        return int(value * SCALE_FACTOR)
    
    def scale_from_contract(value: int) -> float:
        """Convert scaled integer from contract to decimal value."""
        return value / SCALE_FACTOR
    
    @mcp.tool()
    async def get_all_charging_points() -> Dict[str, Any]:
        """Get all available charging stations with their details including location data."""
        try:
            result = blockchain.charging_booking_contract.functions.getAllChargingPoints().call()
            
            stations = []
            for i in range(len(result[0])):  # result[0] is stationIds
                station = {
                    "stationId": result[0][i],
                    "uniqueId": result[1][i],
                    "metadataURL": result[2][i],
                    "pricePerWatt": result[3][i],
                    "pricePerWattEth": blockchain.wei_to_eth(result[3][i]),
                    "power": result[4][i],
                    "owner": result[5][i],
                    "physicalAddress": result[6][i],
                    "latitude": result[7][i] / 1e6,  # Convert from microdegrees
                    "longitude": result[8][i] / 1e6   # Convert from microdegrees
                }
                stations.append(station)
                
            return {
                "success": True,
                "stations": stations,
                "count": len(stations)
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    @mcp.tool()
    async def calculate_charging_price(station_id: int, watt: float, power: float) -> Dict[str, Any]:
        """Calculate the price for charging at a specific station. Supports ALL decimal values including very small ones (e.g., watt=0.005, power=0.001)."""
        try:
            # Accept ANY decimal value - no validation here, let contract decide
            # Convert decimal inputs to scaled integers for contract
            watt_scaled = scale_to_contract(watt)
            power_scaled = scale_to_contract(power)
            
            price = blockchain.charging_booking_contract.functions.calculatePrice(
                station_id, watt_scaled, power_scaled
            ).call()
            
            return {
                "success": True,
                "price": price,
                "price_eth": blockchain.wei_to_eth(price),
                "station_id": station_id,
                "watt": watt,
                "power": power,
                "watt_scaled": watt_scaled,
                "power_scaled": power_scaled,
                "formula": f"({watt} * {power} * pricePerWatt) with 3 decimal precision",
                "note": f"Accepted small decimal values: {watt} watts, {power} power"
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    @mcp.tool()
    async def buy_power_from_station(request: BuyPowerRequest) -> Dict[str, Any]:
        """Purchase power from a charging station. Accepts ANY decimal values including very small ones (e.g., 0.005 watts, 0.001 power)."""
        try:
            # Accept ANY decimal value - no validation here, let contract decide
            # Convert decimal inputs to scaled integers for contract
            watt_scaled = scale_to_contract(request.watt)
            power_scaled = scale_to_contract(request.power)
            
            # Calculate price first
            price = blockchain.charging_booking_contract.functions.calculatePrice(
                request.station_id, watt_scaled, power_scaled
            ).call()
            
            # Encode buyPower function call
            buy_power_data = blockchain.encode_function_call(
                blockchain.charging_booking_contract,
                'buyPower',
                [request.user_address, request.station_id, watt_scaled, power_scaled]
            )
            
            # Execute through UserWallet
            result = blockchain.execute_user_wallet_transaction(
                user_address=request.user_address,
                target_address=blockchain.charging_booking_contract.address,
                amount=price,
                data=buy_power_data
            )
            
            if result["success"]:
                # Decode BookingCreated event to get booking ID
                booking_id = None
                booking_created_events = blockchain.decode_event_logs(
                    blockchain.charging_booking_contract,
                    'BookingCreated',
                    result["receipt"].logs
                )
                
                if booking_created_events:
                    booking_id = booking_created_events[0].bookingId
                
                # Get station URL directly and call /toggle endpoint
                try:
                    station_url = blockchain.charging_station_contract.functions.getStationURL(request.station_id).call()
                    
                    if station_url:
                        # Build toggle endpoint URL: /toggle/<energy>/<power_w>
                        toggle_url = f"{station_url}/toggle/{request.watt}/{request.power}"
                        
                        # Make HTTP GET request to start charging
                        try:
                            async with httpx.AsyncClient(timeout=10.0) as client:
                                http_response = await client.get(toggle_url)
                                
                            http_result = {
                                "device_communication": "success",
                                "station_url": station_url,
                                "toggle_url": toggle_url,
                                "http_status": http_response.status_code,
                                "http_response": http_response.text,
                                "charging_started": http_response.status_code == 200
                            }
                            
                            if http_response.status_code == 200:
                                http_result["note"] = "🔋 Charging device activated successfully!"
                            else:
                                http_result["warning"] = f"Device responded with status {http_response.status_code}"
                                
                        except httpx.TimeoutException:
                            http_result = {
                                "device_communication": "timeout",
                                "station_url": station_url,
                                "toggle_url": toggle_url,
                                "error": "Device request timed out"
                            }
                        except Exception as http_error:
                            http_result = {
                                "device_communication": "failed",
                                "station_url": station_url,
                                "toggle_url": toggle_url,
                                "error": str(http_error)
                            }
                    else:
                        http_result = {
                            "device_communication": "failed",
                            "error": f"No URL found for station {request.station_id}"
                        }
                
                except Exception as station_error:
                    http_result = {
                        "device_communication": "failed",
                        "error": f"Failed to get station URL: {str(station_error)}"
                    }
                
                result.update({
                    "booking_id": booking_id,
                    "price": price,
                    "price_eth": blockchain.wei_to_eth(price),
                    "station_id": request.station_id,
                    "watt": request.watt,
                    "power": request.power,
                    "watt_scaled": watt_scaled,
                    "power_scaled": power_scaled,
                    **http_result
                })
                
            return result
            
        except Exception as e:
            return {"success": False, "error": str(e)}

    # emergency_stop_charging COMPLETELY REMOVED - Use stop_charging instead

    @mcp.tool()
    async def stop_charging(user_address: str) -> Dict[str, Any]:
        """🛑 Smart stop: Automatically finds and stops your most recent charging session for the specified user."""
        try:
            if not user_address:
                return {"success": False, "error": "user_address parameter is required"}
            
            # Find the most recent active booking for this user
            booking_ids = blockchain.charging_booking_contract.functions.getUserBookings(user_address).call()
            if not booking_ids:
                return {"success": False, "error": f"No bookings found for user {user_address}"}
            
            # Find the most recent ACTIVE booking
            booking_id = None
            for bid in reversed(booking_ids):  # Check most recent first
                booking = blockchain.charging_booking_contract.functions.getBooking(bid).call()
                if booking[6] == 0:  # BookingStatus.ACTIVE = 0 (status is at index 6)
                    booking_id = bid
                    break
            
            if booking_id is None:
                return {"success": False, "error": f"No active bookings found for user {user_address}"}
            
            # STEP 1: Get booking details to find station ID
            booking = blockchain.charging_booking_contract.functions.getBooking(booking_id).call()
            station_id = booking[1]
            
            # Get station URL directly and call /stop endpoint
            actual_watts_consumed = 1  # fallback
            device_response = {"device_communication": "no_response"}
            
            try:
                station_url = blockchain.charging_station_contract.functions.getStationURL(station_id).call()
                
                if station_url:
                    stop_url = f"{station_url}/stop"
                    
                    try:
                        async with httpx.AsyncClient(timeout=10.0) as client:
                            stop_response = await client.get(stop_url)
                        
                        device_response = {
                            "device_communication": "success",
                            "station_url": station_url,
                            "stop_url": stop_url,
                            "http_status": stop_response.status_code,
                            "http_response": stop_response.text
                        }
                        
                        if stop_response.status_code == 200:
                            try:
                                # Parse JSON response
                                response_data = stop_response.json()
                                if isinstance(response_data, dict) and "delivered_Wh" in response_data:
                                    delivered_wh = response_data["delivered_Wh"]
                                    # Use Math.ceil to ensure users pay for consumed power
                                    actual_watts_consumed = math.ceil(delivered_wh)
                                    
                                    device_response.update({
                                        "delivered_wh_from_device": delivered_wh,
                                        "rounded_watts_for_contract": actual_watts_consumed,
                                        "rounding_method": "Math.ceil (user pays for any power consumed)",
                                        "device_status": response_data.get("status", "unknown")
                                    })
                                else:
                                    device_response["warning"] = "Device response format not recognized"
                            except Exception:
                                device_response["warning"] = "Could not parse device response as JSON"
                        else:
                            device_response["warning"] = f"Device responded with status {stop_response.status_code}"
                            
                    except httpx.TimeoutException:
                        device_response = {
                            "device_communication": "timeout",
                            "station_url": station_url,
                            "stop_url": stop_url,
                            "error": "Device request timed out, using fallback watts_consumed"
                        }
                    except Exception as http_error:
                        device_response = {
                            "device_communication": "failed",
                            "station_url": station_url,
                            "stop_url": stop_url,
                            "error": str(http_error),
                            "note": "Using fallback watts_consumed"
                        }
                else:
                    device_response = {
                        "device_communication": "failed",
                        "error": f"No URL found for station {station_id}"
                    }
                    
            except Exception as station_error:
                device_response = {
                    "device_communication": "failed",
                    "error": f"Failed to get station URL: {str(station_error)}"
                }
            
            # STEP 3: Now call emergencyStop smart contract with actual/fallback consumed watts
            emergency_stop_data = blockchain.encode_function_call(
                blockchain.charging_booking_contract,
                'emergencyStop',
                [user_address, booking_id, actual_watts_consumed]
            )
            
            # Execute through UserWallet (amount = 0 for emergency stop)
            result = blockchain.execute_user_wallet_transaction(
                user_address=user_address,
                target_address=blockchain.charging_booking_contract.address,
                amount=0,
                data=emergency_stop_data
            )
            
            if result["success"]:
                # Decode EmergencyStop event to get refund details
                emergency_stop_events = blockchain.decode_event_logs(
                    blockchain.charging_booking_contract,
                    'EmergencyStop',
                    result["receipt"].logs
                )
                
                if emergency_stop_events:
                    event = emergency_stop_events[0]
                    result.update({
                        "booking_id": booking_id,
                        "watts_consumed": event.wattsConsumed,
                        "refund_amount": event.refundAmount,
                        "refund_amount_eth": blockchain.wei_to_eth(event.refundAmount),
                        "user_address": user_address,
                        "auto_detected_booking": booking_id,
                        "note": "🛑 Charging stopped successfully! Refund processed based on actual consumption."
                    })
                
                # Add device communication results
                result.update(device_response)
                
            return result
            
        except Exception as e:
            return {"success": False, "error": str(e)}

    @mcp.tool()
    async def prebook_charging_session(request: PrebookRequest) -> Dict[str, Any]:
        """Prebook a charging session without immediate payment."""
        try:
            # Encode prebookCharging function call
            prebook_data = blockchain.encode_function_call(
                blockchain.charging_booking_contract,
                'prebookCharging',
                [request.user_address, request.station_id, request.watt, request.power]
            )
            
            # Execute through UserWallet (amount = 0 for prebooking)
            result = blockchain.execute_user_wallet_transaction(
                user_address=request.user_address,
                target_address=blockchain.charging_booking_contract.address,
                amount=0,
                data=prebook_data
            )
            
            if result["success"]:
                # Decode BookingCreated event to get booking ID
                booking_created_events = blockchain.decode_event_logs(
                    blockchain.charging_booking_contract,
                    'BookingCreated',
                    result["receipt"].logs
                )
                
                if booking_created_events:
                    event = booking_created_events[0]
                    result.update({
                        "booking_id": event.bookingId,
                        "station_id": request.station_id,
                        "watt": request.watt,
                        "power": request.power,
                        "note": "Prebooking created - no payment required yet"
                    })
                
            return result
            
        except Exception as e:
            return {"success": False, "error": str(e)}

    @mcp.tool()
    async def get_booking_details(booking_id: int) -> Dict[str, Any]:
        """Get detailed information about a specific booking."""
        try:
            booking = blockchain.charging_booking_contract.functions.getBooking(booking_id).call()
            
            # Parse booking status enum
            status_map = {0: "ACTIVE", 1: "COMPLETED", 2: "STOPPED"}
            
            return {
                "success": True,
                "booking_id": booking_id,
                "booking": {
                    "user": booking[0],
                    "stationId": booking[1],
                    "watt": booking[2],
                    "power": booking[3],
                    "pricePaid": booking[4],
                    "pricePaidEth": blockchain.wei_to_eth(booking[4]),
                    "timestamp": booking[5],
                    "status": status_map.get(booking[6], "UNKNOWN"),
                    "wattsConsumed": booking[7],
                    "refundAmount": booking[8],
                    "refundAmountEth": blockchain.wei_to_eth(booking[8])
                }
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    @mcp.tool()
    async def get_user_bookings(user_address: str) -> Dict[str, Any]:
        """Get all bookings for a specific user with detailed information."""
        try:
            booking_ids = blockchain.charging_booking_contract.functions.getUserBookings(user_address).call()
            
            bookings = []
            status_map = {0: "ACTIVE", 1: "COMPLETED", 2: "STOPPED"}
            
            for booking_id in booking_ids:
                try:
                    booking = blockchain.charging_booking_contract.functions.getBooking(booking_id).call()
                    booking_data = {
                        "bookingId": booking_id,
                        "user": booking[0],
                        "stationId": booking[1],
                        "watt": booking[2],
                        "power": booking[3],
                        "pricePaid": booking[4],
                        "pricePaidEth": blockchain.wei_to_eth(booking[4]),
                        "timestamp": booking[5],
                        "status": status_map.get(booking[6], "UNKNOWN"),
                        "wattsConsumed": booking[7],
                        "refundAmount": booking[8],
                        "refundAmountEth": blockchain.wei_to_eth(booking[8])
                    }
                    bookings.append(booking_data)
                except Exception:
                    continue
            
            return {
                "success": True,
                "user": user_address,
                "bookings": bookings,
                "count": len(bookings)
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    @mcp.tool()
    async def get_station_bookings(station_id: int) -> Dict[str, Any]:
        """Get all paid bookings for a specific charging station."""
        try:
            result = blockchain.charging_booking_contract.functions.getStationBookings(station_id).call()
            
            bookings = []
            for i in range(len(result[0])):  # result[0] is users array
                booking = {
                    "user": result[0][i],
                    "amountPaid": result[1][i],
                    "amountPaidEth": blockchain.wei_to_eth(result[1][i]),
                    "bookingId": result[2][i]
                }
                bookings.append(booking)
            
            return {
                "success": True,
                "station_id": station_id,
                "bookings": bookings,
                "count": len(bookings)
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    @mcp.tool()
    async def get_station_prebookings(station_id: int) -> Dict[str, Any]:
        """Get all prebookings for a specific charging station."""
        try:
            result = blockchain.charging_booking_contract.functions.getStationPrebookings(station_id).call()
            
            prebookings = []
            for i in range(len(result[0])):  # result[0] is users array
                prebooking = {
                    "user": result[0][i],
                    "watt": result[1][i],
                    "power": result[2][i],
                    "bookingId": result[3][i],
                    "timestamp": result[4][i]
                }
                prebookings.append(prebooking)
            
            return {
                "success": True,
                "station_id": station_id,
                "prebookings": prebookings,
                "count": len(prebookings)
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    @mcp.tool()
    async def get_owner_earnings(owner_address: str) -> Dict[str, Any]:
        """Get earnings for a specific station owner."""
        try:
            earnings = blockchain.charging_booking_contract.functions.getOwnerEarnings(owner_address).call()
            
            return {
                "success": True,
                "owner": owner_address,
                "earnings": earnings,
                "earnings_eth": blockchain.wei_to_eth(earnings)
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    @mcp.tool()
    async def complete_charging_workflow(request: CompleteChargingRequest) -> Dict[str, Any]:
        """Complete end-to-end charging workflow: buy power → charge → emergency stop with real consumption."""
        workflow_results = {
            "step_1_buy_power": {},
            "step_2_charging": {},
            "step_3_stop_device": {},
            "step_4_emergency_stop": {}
        }
        actual_watts_consumed = 1  # Initialize with default fallback
        booking_id = None
        
        try:
            # STEP 1: Buy Power (starts charging device) - duplicate the logic instead of calling
            try:
                # Calculate price first
                price = blockchain.charging_booking_contract.functions.calculatePrice(
                    request.station_id, request.watt, request.power
                ).call()
                
                # Encode buyPower function call
                buy_power_data = blockchain.encode_function_call(
                    blockchain.charging_booking_contract,
                    'buyPower',
                    [request.user_address, request.station_id, request.watt, request.power]
                )
                
                # Execute through UserWallet
                buy_result = blockchain.execute_user_wallet_transaction(
                    user_address=request.user_address,
                    target_address=blockchain.charging_booking_contract.address,
                    amount=price,
                    data=buy_power_data
                )
                
                if buy_result["success"]:
                    # Decode BookingCreated event to get booking ID
                    booking_created_events = blockchain.decode_event_logs(
                        blockchain.charging_booking_contract,
                        'BookingCreated',
                        buy_result["receipt"].logs
                    )
                    
                    if booking_created_events:
                        booking_id = booking_created_events[0].bookingId
                    
                    # Get station URL directly and call /toggle endpoint
                    try:
                        station_url = blockchain.charging_station_contract.functions.getStationURL(request.station_id).call()
                        
                        if station_url:
                            # Build toggle endpoint URL: /toggle/<energy>/<power_w>
                            toggle_url = f"{station_url}/toggle/{request.watt}/{request.power}"
                            
                            # Make HTTP GET request to start charging
                            try:
                                async with httpx.AsyncClient(timeout=10.0) as client:
                                    http_response = await client.get(toggle_url)
                                    
                                http_result = {
                                    "device_communication": "success",
                                    "station_url": station_url,
                                    "toggle_url": toggle_url,
                                    "http_status": http_response.status_code,
                                    "http_response": http_response.text,
                                    "charging_started": http_response.status_code == 200
                                }
                                
                            except Exception as http_error:
                                http_result = {
                                    "device_communication": "failed",
                                    "station_url": station_url,
                                    "toggle_url": toggle_url,
                                    "error": str(http_error)
                                }
                        else:
                            http_result = {
                                "device_communication": "failed",
                                "error": f"No URL found for station {request.station_id}"
                            }
                    
                    except Exception as station_error:
                        http_result = {
                            "device_communication": "failed",
                            "error": f"Failed to get station URL: {str(station_error)}"
                        }
                    
                    buy_result.update({
                        "booking_id": booking_id,
                        "price": price,
                        "price_eth": blockchain.wei_to_eth(price),
                        **http_result
                    })
                
                workflow_results["step_1_buy_power"] = buy_result
                
                if not buy_result.get("success") or booking_id is None:
                    return {
                        "success": False,
                        "error": "Failed at step 1: Buy power or get booking_id",
                        "workflow_results": workflow_results
                    }
                
            except Exception as step1_error:
                workflow_results["step_1_buy_power"] = {"success": False, "error": str(step1_error)}
                return {
                    "success": False,
                    "error": f"Step 1 failed: {str(step1_error)}",
                    "workflow_results": workflow_results
                }
            
            # STEP 2: Wait for charging
            try:
                workflow_results["step_2_charging"] = {
                    "status": "waiting",
                    "duration_seconds": request.charging_duration_seconds,
                    "note": f"Allowing device to charge for {request.charging_duration_seconds} seconds..."
                }
                
                await asyncio.sleep(request.charging_duration_seconds)
                
                workflow_results["step_2_charging"].update({
                    "status": "completed",
                    "note": f"Charging period of {request.charging_duration_seconds} seconds completed"
                })
                
            except Exception as step2_error:
                workflow_results["step_2_charging"]["error"] = str(step2_error)
            
            # STEP 3: Get station URL and call /stop endpoint
            try:
                booking = blockchain.charging_booking_contract.functions.getBooking(booking_id).call()
                station_id = booking[1]
                
                try:
                    station_url = blockchain.charging_station_contract.functions.getStationURL(station_id).call()
                    
                    if station_url:
                        stop_url = f"{station_url}/stop"
                        
                        async with httpx.AsyncClient(timeout=10.0) as client:
                            stop_response = await client.get(stop_url)
                        
                        delivered_wh = 0
                        actual_watts_consumed = 1  # fallback minimum
                        
                        if stop_response.status_code == 200:
                            try:
                                response_data = stop_response.json()
                                if isinstance(response_data, dict) and "delivered_Wh" in response_data:
                                    delivered_wh = response_data["delivered_Wh"]
                                    actual_watts_consumed = math.ceil(delivered_wh)
                                    
                                workflow_results["step_3_stop_device"] = {
                                    "status": "success",
                                    "station_url": station_url,
                                    "stop_url": stop_url,
                                    "http_status": stop_response.status_code,
                                    "delivered_wh_from_device": delivered_wh,
                                    "rounded_watts_for_contract": actual_watts_consumed,
                                    "device_status": response_data.get("status", "unknown"),
                                    "rounding_method": "Math.ceil (ensures user pays for consumed power)"
                                }
                            except Exception:
                                workflow_results["step_3_stop_device"] = {
                                    "status": "partial_success",
                                    "station_url": station_url,
                                    "stop_url": stop_url,
                                    "http_status": stop_response.status_code,
                                    "warning": "Could not parse device response",
                                    "fallback_watts": actual_watts_consumed
                                }
                        else:
                            workflow_results["step_3_stop_device"] = {
                                "status": "device_error",
                                "station_url": station_url,
                                "stop_url": stop_url,
                                "http_status": stop_response.status_code,
                                "error": f"Device returned status {stop_response.status_code}",
                                "fallback_watts": actual_watts_consumed
                            }
                    else:
                        workflow_results["step_3_stop_device"] = {
                            "status": "failed",
                            "error": f"No URL found for station {station_id}",
                            "fallback_watts": actual_watts_consumed
                        }
                        
                except Exception as station_error:
                    workflow_results["step_3_stop_device"] = {
                        "status": "failed",
                        "error": f"Failed to get station URL: {str(station_error)}",
                        "fallback_watts": actual_watts_consumed
                    }
                    
            except httpx.TimeoutException:
                workflow_results["step_3_stop_device"] = {
                    "status": "timeout",
                    "error": "Device request timed out",
                    "fallback_watts": actual_watts_consumed
                }
            except Exception as step3_error:
                workflow_results["step_3_stop_device"] = {
                    "status": "failed",
                    "error": str(step3_error),
                    "fallback_watts": actual_watts_consumed
                }
            
            # STEP 4: Emergency stop with actual consumed watts
            try:
                # Call emergency stop smart contract directly to avoid duplicate HTTP calls
                emergency_stop_data = blockchain.encode_function_call(
                    blockchain.charging_booking_contract,
                    'emergencyStop',
                    [request.user_address, booking_id, actual_watts_consumed]
                )
                
                result = blockchain.execute_user_wallet_transaction(
                    user_address=request.user_address,
                    target_address=blockchain.charging_booking_contract.address,
                    amount=0,
                    data=emergency_stop_data
                )
                
                if result["success"]:
                    # Decode EmergencyStop event
                    emergency_stop_events = blockchain.decode_event_logs(
                        blockchain.charging_booking_contract,
                        'EmergencyStop',
                        result["receipt"].logs
                    )
                    
                    if emergency_stop_events:
                        event = emergency_stop_events[0]
                        result.update({
                            "watts_consumed": event.wattsConsumed,
                            "refund_amount": event.refundAmount,
                            "refund_amount_eth": blockchain.wei_to_eth(event.refundAmount)
                        })
                
                workflow_results["step_4_emergency_stop"] = result
                
            except Exception as step4_error:
                workflow_results["step_4_emergency_stop"] = {
                    "success": False,
                    "error": str(step4_error)
                }
            
            # Final result
            all_steps_successful = (
                workflow_results["step_1_buy_power"].get("success", False) and
                workflow_results["step_2_charging"].get("status") == "completed" and
                workflow_results["step_3_stop_device"].get("status") in ["success", "partial_success"] and
                workflow_results["step_4_emergency_stop"].get("success", False)
            )
            
            return {
                "success": all_steps_successful,
                "workflow_type": "complete_charging_cycle",
                "booking_id": booking_id,
                "parameters": {
                    "user_address": request.user_address,
                    "station_id": request.station_id,
                    "watt": request.watt,
                    "power": request.power,
                    "charging_duration": request.charging_duration_seconds
                },
                "workflow_results": workflow_results,
                "summary": {
                    "purchased_watt": request.watt,
                    "actual_delivered_wh": workflow_results["step_3_stop_device"].get("delivered_wh_from_device", 0),
                    "charged_watts": actual_watts_consumed,
                    "refund_amount_eth": workflow_results["step_4_emergency_stop"].get("refund_amount_eth", 0),
                    "device_integration": workflow_results["step_1_buy_power"].get("device_communication") == "success" and
                                         workflow_results["step_3_stop_device"].get("status") in ["success", "partial_success"]
                }
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": f"Complete workflow failed: {str(e)}",
                "workflow_results": workflow_results
            }

    @mcp.tool()
    async def withdraw_owner_earnings() -> Dict[str, Any]:
        """Withdraw earnings for the admin account (station owner)."""
        try:
            # Build transaction for withdrawEarnings
            transaction = blockchain.charging_booking_contract.functions.withdrawEarnings().build_transaction({
                'from': blockchain.admin_account.address,
                'gas': 200000,
            })
            
            result = blockchain.send_transaction(transaction)
            
            if result["success"]:
                # Decode EarningsWithdrawn event
                earnings_events = blockchain.decode_event_logs(
                    blockchain.charging_booking_contract,
                    'EarningsWithdrawn',
                    result["receipt"].logs
                )
                
                if earnings_events:
                    event = earnings_events[0]
                    result.update({
                        "withdrawn_amount": event.amount,
                        "withdrawn_amount_eth": blockchain.wei_to_eth(event.amount),
                        "owner": event.owner
                    })
                
            return result
            
        except Exception as e:
            return {"success": False, "error": str(e)}

    @mcp.tool()
    async def get_booking_count() -> Dict[str, Any]:
        """Get the total number of bookings in the system."""
        try:
            count = blockchain.charging_booking_contract.functions.getBookingCount().call()
            
            return {
                "success": True,
                "total_bookings": count
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    @mcp.tool()
    async def get_contract_balance() -> Dict[str, Any]:
        """Get the current balance of the ChargingBooking contract."""
        try:
            balance = blockchain.charging_booking_contract.functions.getContractBalance().call()
            
            return {
                "success": True,
                "contract_balance": balance,
                "contract_balance_eth": blockchain.wei_to_eth(balance)
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    @mcp.tool()
    async def get_station_battery_capacity(station_id: int) -> Dict[str, Any]:
        """Get the current battery capacity and status of a charging station by calling its /battery endpoint."""
        try:
            # Get station URL from the blockchain
            station_url = blockchain.charging_station_contract.functions.getStationURL(station_id).call()
            
            if not station_url:
                return {"success": False, "error": f"No URL found for station {station_id}"}
            
            # Build the battery endpoint URL
            battery_url = station_url + "/battery"
            
            # Make HTTP GET request to the battery endpoint
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    battery_response = await client.get(battery_url)
                
                if battery_response.status_code == 200:
                    try:
                        battery_data = battery_response.json()
                        
                        return {
                            "success": True,
                            "station_id": station_id,
                            "station_url": station_url,
                            "battery_url": battery_url,
                            "battery_info": {
                                "voltage": battery_data.get("voltage", 0),
                                "capacity_Wh": battery_data.get("capacity_Wh", 0),
                                "percentage": battery_data.get("percentage", 0)
                            },
                            "http_status": battery_response.status_code,
                            "note": "🔋 Battery information retrieved successfully"
                        }
                    except Exception as parse_error:
                        return {
                            "success": False,
                            "error": f"Failed to parse battery response: {str(parse_error)}",
                            "station_id": station_id,
                            "battery_url": battery_url,
                            "http_status": battery_response.status_code,
                            "raw_response": battery_response.text
                        }
                else:
                    return {
                        "success": False,
                        "error": f"Battery endpoint returned status {battery_response.status_code}",
                        "station_id": station_id,
                        "battery_url": battery_url,
                        "http_status": battery_response.status_code,
                        "raw_response": battery_response.text
                    }
                    
            except httpx.TimeoutException:
                return {
                    "success": False,
                    "error": "Request to battery endpoint timed out",
                    "station_id": station_id,
                    "battery_url": battery_url,
                    "timeout_seconds": 10
                }
            except Exception as http_error:
                return {
                    "success": False,
                    "error": f"HTTP request failed: {str(http_error)}",
                    "station_id": station_id,
                    "battery_url": battery_url
                }
                
        except Exception as e:
            return {"success": False, "error": str(e), "station_id": station_id}

    @mcp.tool()
    async def find_nearest_charging_station(user_latitude: float, user_longitude: float, max_results: int = 5) -> Dict[str, Any]:
        """Find the nearest charging stations to the user's location using the Haversine algorithm."""
        try:
            # Get all charging stations
            result = blockchain.charging_booking_contract.functions.getAllChargingPoints().call()
            
            if not result[0]:  # No stations available
                return {
                    "success": False,
                    "error": "No charging stations found",
                    "user_location": {"latitude": user_latitude, "longitude": user_longitude}
                }
            
            stations_with_distance = []
            
            # Calculate distance to each station using Haversine formula
            for i in range(len(result[0])):  # result[0] is stationIds
                station_lat = result[7][i] / 1e6  # Convert from microdegrees
                station_lng = result[8][i] / 1e6   # Convert from microdegrees
                
                # Haversine formula to calculate distance
                distance_km = haversine_distance(user_latitude, user_longitude, station_lat, station_lng)
                
                station_info = {
                    "stationId": result[0][i],
                    "uniqueId": result[1][i],
                    "metadataURL": result[2][i],
                    "pricePerWatt": result[3][i],
                    "pricePerWattEth": blockchain.wei_to_eth(result[3][i]),
                    "power": result[4][i],
                    "owner": result[5][i],
                    "physicalAddress": result[6][i],
                    "latitude": station_lat,
                    "longitude": station_lng,
                    "distance_km": round(distance_km, 2),
                    "distance_miles": round(distance_km * 0.621371, 2)
                }
                
                stations_with_distance.append(station_info)
            
            # Sort by distance (closest first)
            stations_with_distance.sort(key=lambda x: x["distance_km"])
            
            # Limit results
            nearest_stations = stations_with_distance[:max_results]
            
            return {
                "success": True,
                "user_location": {
                    "latitude": user_latitude,
                    "longitude": user_longitude
                },
                "total_stations_found": len(stations_with_distance),
                "showing_results": len(nearest_stations),
                "max_results": max_results,
                "nearest_stations": nearest_stations,
                "algorithm": "Haversine formula for great-circle distance",
                "note": f"📍 Found {len(nearest_stations)} nearest charging stations"
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "user_location": {"latitude": user_latitude, "longitude": user_longitude}
            }


    @mcp.tool()
    async def estimate_charging_time(station_id: int, energy_wh: float, power_rate: float) -> Dict[str, Any]:
        """Estimate charging time for a station by calling its /estimate endpoint with energy needs and power rate."""
        try:
            # Get station URL from the blockchain
            station_url = blockchain.charging_station_contract.functions.getStationURL(station_id).call()
            
            if not station_url:
                return {"success": False, "error": f"No URL found for station {station_id}"}
            
            # Validate parameters
            # if power_rate <= 0 or power_rate > 1:
            #     return {
            #         "success": False,
            #         "error": "Power rate must be between 0 and 1",
            #         "note": "Power rate should be a fraction (0.0 to 1.0) representing charging efficiency"
            #     }
            
            if energy_wh <= 0:
                return {
                    "success": False,
                    "error": "Energy must be greater than 0 Wh"
                }
            
            # Build the estimate endpoint URL
            estimate_url = f"{station_url}/estimate/{energy_wh}/{power_rate}"
            
            # Make HTTP GET request to the estimate endpoint
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    estimate_response = await client.get(estimate_url)
                
                if estimate_response.status_code == 200:
                    estimate_text = estimate_response.text
                    
                    # Calculate time locally as well for structured response
                    time_seconds = (energy_wh / power_rate) * 3600
                    minutes = int(time_seconds // 60)
                    seconds = int(time_seconds % 60)
                    hours = int(minutes // 60)
                    remaining_minutes = minutes % 60
                    
                    return {
                        "success": True,
                        "station_id": station_id,
                        "station_url": station_url,
                        "estimate_url": estimate_url,
                        "parameters": {
                            "energy_wh": energy_wh,
                            "power_rate": power_rate,
                            "energy_formatted": f"{energy_wh} Wh",
                            "power_rate_percentage": f"{power_rate * 100:.1f}%"
                        },
                        "time_estimation": {
                            "total_seconds": int(time_seconds),
                            "minutes": minutes,
                            "seconds": seconds % 60,
                            "hours": hours,
                            "remaining_minutes": remaining_minutes,
                            "formatted_time": f"{hours}h {remaining_minutes}m {seconds % 60}s" if hours > 0 else f"{remaining_minutes}m {seconds % 60}s",
                            "device_response": estimate_text
                        },
                        "http_status": estimate_response.status_code,
                        "note": f"⏱️ Estimated charging time calculated successfully"
                    }
                else:
                    return {
                        "success": False,
                        "error": f"Estimate endpoint returned status {estimate_response.status_code}",
                        "station_id": station_id,
                        "estimate_url": estimate_url,
                        "http_status": estimate_response.status_code,
                        "raw_response": estimate_response.text
                    }
                    
            except httpx.TimeoutException:
                return {
                    "success": False,
                    "error": "Request to estimate endpoint timed out",
                    "station_id": station_id,
                    "estimate_url": estimate_url,
                    "timeout_seconds": 10
                }
            except Exception as http_error:
                return {
                    "success": False,
                    "error": f"HTTP request failed: {str(http_error)}",
                    "station_id": station_id,
                    "estimate_url": estimate_url
                }
                
        except Exception as e:
            return {"success": False, "error": str(e), "station_id": station_id}


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great circle distance between two points on Earth using the Haversine formula.
    Returns distance in kilometers.
    """
    # Earth's radius in kilometers
    R = 6371.0
    
    # Convert latitude and longitude from degrees to radians
    lat1_rad = math.radians(lat1)
    lon1_rad = math.radians(lon1)
    lat2_rad = math.radians(lat2)
    lon2_rad = math.radians(lon2)
    
    # Difference in coordinates
    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad
    
    # Haversine formula
    a = math.sin(dlat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    # Distance in kilometers
    distance = R * c
    
    return distance

    @mcp.tool()
    async def debug_balance_and_earnings() -> Dict[str, Any]:
        """🔍 Debug tool to check UserWallet balances, ChargingBooking earnings, and transaction flow."""
        try:
            debug_info = {
                "timestamp": blockchain.w3.eth.get_block('latest')['timestamp'],
                "contracts": {
                    "user_wallet": blockchain.user_wallet_contract.address,
                    "charging_booking": blockchain.charging_booking_contract.address,
                    "charging_station": blockchain.charging_station_contract.address
                }
            }
            
            # 1. Get all user balances in UserWallet
            try:
                # Check some test addresses
                test_addresses = [
                    "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",  # Default hardhat account
                    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",  # Second hardhat account
                    blockchain.admin_account.address  # Admin account
                ]
                
                user_balances = {}
                for addr in test_addresses:
                    try:
                        balance_wei = blockchain.user_wallet_contract.functions.getUserBalance(addr).call()
                        native_balance_wei = blockchain.w3.eth.get_balance(addr)
                        user_balances[addr] = {
                            "user_wallet_balance_wei": balance_wei,
                            "user_wallet_balance_sei": blockchain.wei_to_eth(balance_wei),
                            "native_balance_wei": native_balance_wei,
                            "native_balance_sei": blockchain.wei_to_eth(native_balance_wei)
                        }
                    except Exception as e:
                        user_balances[addr] = {"error": str(e)}
                
                debug_info["user_balances"] = user_balances
                
            except Exception as balance_error:
                debug_info["user_balances"] = {"error": str(balance_error)}
            
            # 2. Get UserWallet contract balance
            try:
                contract_balance_wei = blockchain.user_wallet_contract.functions.getContractBalance().call()
                debug_info["user_wallet_contract"] = {
                    "balance_wei": contract_balance_wei,
                    "balance_sei": blockchain.wei_to_eth(contract_balance_wei)
                }
            except Exception as contract_error:
                debug_info["user_wallet_contract"] = {"error": str(contract_error)}
            
            # 3. Get ChargingBooking contract balance
            try:
                booking_balance_wei = blockchain.charging_booking_contract.functions.getContractBalance().call()
                debug_info["charging_booking_contract"] = {
                    "balance_wei": booking_balance_wei,
                    "balance_sei": blockchain.wei_to_eth(booking_balance_wei)
                }
            except Exception as booking_error:
                debug_info["charging_booking_contract"] = {"error": str(booking_error)}
            
            # 4. Get owner earnings for all stations
            try:
                # Get all stations first
                stations_result = blockchain.charging_booking_contract.functions.getAllChargingPoints().call()
                owner_earnings = {}
                
                if stations_result and len(stations_result) > 5:  # Should have owners array
                    owners = stations_result[5]  # owners array is at index 5
                    unique_owners = list(set(owners))  # Remove duplicates
                    
                    for owner in unique_owners:
                        try:
                            earnings_wei = blockchain.charging_booking_contract.functions.getOwnerEarnings(owner).call()
                            owner_earnings[owner] = {
                                "earnings_wei": earnings_wei,
                                "earnings_sei": blockchain.wei_to_eth(earnings_wei)
                            }
                        except Exception:
                            owner_earnings[owner] = {"error": "Failed to get earnings"}
                    
                debug_info["owner_earnings"] = owner_earnings
                
            except Exception as earnings_error:
                debug_info["owner_earnings"] = {"error": str(earnings_error)}
            
            # 5. Get recent bookings
            try:
                booking_count = blockchain.charging_booking_contract.functions.getBookingCount().call()
                debug_info["booking_summary"] = {
                    "total_bookings": booking_count,
                    "recent_bookings": []
                }
                
                # Get last 5 bookings
                start_id = max(0, booking_count - 5)
                for booking_id in range(start_id, booking_count):
                    try:
                        booking = blockchain.charging_booking_contract.functions.getBooking(booking_id).call()
                        status_map = {0: "ACTIVE", 1: "COMPLETED", 2: "STOPPED"}
                        
                        booking_info = {
                            "booking_id": booking_id,
                            "user": booking[0],
                            "station_id": booking[1],
                            "watt": booking[2],
                            "power": booking[3],
                            "price_paid_wei": booking[4],
                            "price_paid_sei": blockchain.wei_to_eth(booking[4]),
                            "timestamp": booking[5],
                            "status": status_map.get(booking[6], "UNKNOWN"),
                            "watts_consumed": booking[7],
                            "refund_amount_wei": booking[8],
                            "refund_amount_sei": blockchain.wei_to_eth(booking[8])
                        }
                        debug_info["booking_summary"]["recent_bookings"].append(booking_info)
                        
                    except Exception:
                        continue
                        
            except Exception as booking_error:
                debug_info["booking_summary"] = {"error": str(booking_error)}
            
            # 6. Check gas prices and transaction costs
            try:
                gas_price = blockchain.w3.eth.gas_price
                debug_info["gas_info"] = {
                    "current_gas_price_wei": gas_price,
                    "current_gas_price_gwei": gas_price // 1000000000,
                    "estimated_buy_power_cost_wei": gas_price * 250000,
                    "estimated_buy_power_cost_sei": blockchain.wei_to_eth(gas_price * 250000)
                }
            except Exception as gas_error:
                debug_info["gas_info"] = {"error": str(gas_error)}
            
            return {
                "success": True,
                "debug_info": debug_info,
                "note": "🔍 Balance and earnings diagnostic completed"
            }
            
        except Exception as e:
            return {"success": False, "error": str(e)}