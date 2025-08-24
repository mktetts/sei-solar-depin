"""
Tool handlers for SEI Solar Charging Station MCP Server HTTP API
"""

import asyncio
import httpx
import math
from typing import Dict, Any

from config import config
from blockchain import blockchain


async def call_registered_tool(tool_name: str, **kwargs) -> Dict[str, Any]:
    """Route tool calls to the registered modular tools via direct blockchain calls."""
    
    # Server management tools (built-in)
    if tool_name == "health_check":
        is_connected = blockchain.web3.is_connected()
        current_block = None
        if is_connected:
            try:
                current_block = blockchain.web3.eth.block_number
            except:
                pass
        
        return {
            "status": "healthy" if is_connected else "unhealthy",
            "blockchain_connected": is_connected,
            "current_block": current_block,
            "admin_account": blockchain.admin_account.address,
            "timestamp": __import__('time').time()
        }
    
    elif tool_name == "get_server_info":
        is_connected = blockchain.web3.is_connected()
        block_number = blockchain.web3.eth.block_number if is_connected else None
        
        return {
            "server_name": "EV Solar Charging Station MCP Server",
            "version": "1.0.0",
            "transport": "SSE",
            "blockchain": {
                "connected": is_connected,
                "rpc_url": config.RPC_URL,
                "current_block": block_number,
                "admin_address": blockchain.admin_account.address,
            },
            "contracts": {
                "charging_booking": {"address": config.CHARGING_BOOKING_ADDRESS},
                "user_wallet": {"address": config.USER_WALLET_ADDRESS},
                "charging_station": {"address": config.CHARGING_STATION_ADDRESS}
            }
        }
    
    # User wallet tools
    elif tool_name == "get_user_balance":
        try:
            user_address = kwargs.get("user_address")
            if not user_address:
                return {"error": "user_address parameter is required", "example": {"user_address": "0x..."}}

            balance_wei = blockchain.user_wallet_contract.functions.getUserBalance(user_address).call()
            balance_sei = blockchain.wei_to_sei(balance_wei)

            return {
                "user": user_address,
                "balance_wei": balance_wei,
                "balance_sei": balance_sei,
                "balance_formatted": f"{balance_sei:.6f} SEI"
            }
        except Exception as e:
            return {"error": str(e), "note": "Contracts may not be deployed"}
    
    elif tool_name == "get_gas_estimates":
        try:
            gas_price = blockchain.get_gas_price()
            gas_price_gwei = gas_price / 1e9
            
            operations = {
                "simple_transfer": 21000,
                "deposit_to_wallet": 50000,
                "buy_power": 300000,
                "emergency_stop": 200000,
                "withdraw_earnings": 100000
            }
            
            estimates = {}
            for op, gas in operations.items():
                cost_wei = gas * gas_price
                cost_sei = blockchain.wei_to_sei(cost_wei)
                estimates[op] = {
                    "gas_limit": gas,
                    "gas_cost_wei": cost_wei,
                    "gas_cost_sei": cost_sei,
                    "gas_cost_formatted": f"{cost_sei:.6f} SEI"
                }
            
            return {
                "current_gas_price_wei": gas_price,
                "current_gas_price_gwei": gas_price_gwei,
                "current_gas_price_formatted": f"{gas_price_gwei:.2f} gwei",
                "operations": estimates
            }
        except Exception as e:
            return {"error": str(e)}
    
    # Charging booking tools - Complete implementations
    elif tool_name == "get_all_charging_points":
        try:
            result = blockchain.charging_booking_contract.functions.getAllChargingPoints().call()
            
            stations = []
            for i in range(len(result[0])):  # result[0] is stationIds
                station = {
                    "stationId": result[0][i],
                    "uniqueId": result[1][i],
                    "metadataURL": result[2][i],
                    "pricePerWatt": result[3][i],
                    "pricePerWattSei": blockchain.wei_to_sei(result[3][i]),
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

    elif tool_name == "calculate_charging_price":
        try:
            station_id = kwargs.get("station_id", 0)
            watt = float(kwargs.get("watt", 10.0))  # Accept float values
            power = float(kwargs.get("power", 100.0))  # Accept float values
            
            # Scale for contract (3 decimal places)
            SCALE_FACTOR = 1000
            watt_scaled = int(watt * SCALE_FACTOR)
            power_scaled = int(power * SCALE_FACTOR)
            
            price = blockchain.charging_booking_contract.functions.calculatePrice(
                station_id, watt_scaled, power_scaled
            ).call()
            
            return {
                "success": True,
                "price": price,
                "price_sei": blockchain.wei_to_sei(price),
                "station_id": station_id,
                "watt": watt,
                "power": power,
                "watt_scaled": watt_scaled,
                "power_scaled": power_scaled,
                "formula": f"({watt} * {power} * pricePerWatt) with 3 decimal precision"
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    elif tool_name == "buy_power_from_station":
        try:
            user_address = kwargs.get("user_address")
            station_id = kwargs.get("station_id", 0)
            watt = float(kwargs.get("watt", 10.0))  # Accept float values
            power = float(kwargs.get("power", 100.0))  # Accept float values
            
            if not user_address:
                return {"success": False, "error": "user_address parameter is required"}
            
            # Scale for contract (3 decimal places)
            SCALE_FACTOR = 1000
            watt_scaled = int(watt * SCALE_FACTOR)
            power_scaled = int(power * SCALE_FACTOR)
            
            # Calculate price first
            price = blockchain.charging_booking_contract.functions.calculatePrice(
                station_id, watt_scaled, power_scaled
            ).call()
            
            # Encode buyPower function call
            buy_power_data = blockchain.encode_function_call(
                blockchain.charging_booking_contract,
                'buyPower',
                [user_address, station_id, watt_scaled, power_scaled]
            )
            
            # Execute through UserWallet
            result = blockchain.execute_user_wallet_transaction(
                user_address=user_address,
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
                    result["receipt"]["logs"]
                )
                
                if booking_created_events:
                    booking_id = booking_created_events[0]['bookingId'] if isinstance(booking_created_events[0], dict) else booking_created_events[0].bookingId
                
                # Get station URL directly and call /toggle endpoint
                try:
                    station_url = blockchain.charging_station_contract.functions.getStationURL(station_id).call()
                    
                    if station_url:
                        # Build toggle endpoint URL: /toggle/<energy>/<power_w> (use original decimal values)
                        toggle_url = f"{station_url}/toggle/{watt}/{power}"
                        
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
                            "error": f"No URL found for station {station_id}"
                        }
                
                except Exception as station_error:
                    http_result = {
                        "device_communication": "failed",
                        "error": f"Failed to get station URL: {str(station_error)}"
                    }
                
                result.update({
                    "booking_id": booking_id,
                    "price": price,
                    "price_sei": blockchain.wei_to_sei(price),
                    "station_id": station_id,
                    "watt": watt,
                    "power": power,
                    "watt_scaled": watt_scaled,
                    "power_scaled": power_scaled,
                    **http_result
                })
                
            return result
            
        except Exception as e:
            return {"success": False, "error": str(e)}

    elif tool_name == "get_user_bookings":
        try:
            user_address = kwargs.get("user_address")
            if not user_address:
                return {"success": False, "error": "user_address parameter is required"}

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
                        "pricePaidSei": blockchain.wei_to_sei(booking[4]),
                        "timestamp": booking[5],
                        "status": status_map.get(booking[6], "UNKNOWN"),
                        "wattsConsumed": booking[7],
                        "refundAmount": booking[8],
                        "refundAmountSei": blockchain.wei_to_sei(booking[8])
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

    elif tool_name == "get_booking_details":
        try:
            booking_id = kwargs.get("booking_id")
            if booking_id is None:
                return {"success": False, "error": "booking_id parameter is required"}

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
                    "pricePaidSei": blockchain.wei_to_sei(booking[4]),
                    "timestamp": booking[5],
                    "status": status_map.get(booking[6], "UNKNOWN"),
                    "wattsConsumed": booking[7],
                    "refundAmount": booking[8],
                    "refundAmountSei": blockchain.wei_to_sei(booking[8])
                }
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    elif tool_name == "prebook_charging_session":
        try:
            user_address = kwargs.get("user_address")
            station_id = kwargs.get("station_id", 0)
            watt = kwargs.get("watt", 10)
            power = kwargs.get("power", 100)
            
            if not user_address:
                return {"success": False, "error": "user_address parameter is required"}
            
            # Encode prebookCharging function call
            prebook_data = blockchain.encode_function_call(
                blockchain.charging_booking_contract,
                'prebookCharging',
                [user_address, station_id, watt, power]
            )
            
            # Execute through UserWallet (amount = 0 for prebooking)
            result = blockchain.execute_user_wallet_transaction(
                user_address=user_address,
                target_address=blockchain.charging_booking_contract.address,
                amount=0,
                data=prebook_data
            )
            
            if result["success"]:
                # Decode BookingCreated event to get booking ID
                booking_created_events = blockchain.decode_event_logs(
                    blockchain.charging_booking_contract,
                    'BookingCreated',
                    result["receipt"]["logs"]
                )
                
                if booking_created_events:
                    event = booking_created_events[0]
                    booking_id = event['bookingId'] if isinstance(event, dict) else event.bookingId
                    result.update({
                        "booking_id": booking_id,
                        "station_id": station_id,
                        "watt": watt,
                        "power": power,
                        "note": "Prebooking created - no payment required yet"
                    })
                
            return result
            
        except Exception as e:
            return {"success": False, "error": str(e)}

    elif tool_name == "get_booking_count":
        try:
            count = blockchain.charging_booking_contract.functions.getBookingCount().call()
            
            return {
                "success": True,
                "total_bookings": count
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    elif tool_name == "get_contract_balance":
        try:
            balance = blockchain.charging_booking_contract.functions.getContractBalance().call()
            
            return {
                "success": True,
                "contract_balance": balance,
                "contract_balance_sei": blockchain.wei_to_sei(balance)
            }
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    elif tool_name == "stop_charging":
        """Smart emergency stop that automatically finds and stops the most recent active booking."""
        try:
            user_address = kwargs.get("user_address")
            if not user_address:
                return {"success": False, "error": "user_address parameter is required", "example": {"user_address": "0x..."}}
            
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
                    result["receipt"]["logs"]
                )
                
                if emergency_stop_events:
                    event = emergency_stop_events[0]
                    watts_consumed = event['wattsConsumed'] if isinstance(event, dict) else event.wattsConsumed
                    refund_amount = event['refundAmount'] if isinstance(event, dict) else event.refundAmount
                    result.update({
                        "booking_id": booking_id,
                        "watts_consumed": watts_consumed,
                        "refund_amount": refund_amount,
                        "refund_amount_sei": blockchain.wei_to_sei(refund_amount)
                    })
                
                # Add device communication results
                result.update(device_response)
                result.update({
                    "user_address": user_address,
                    "auto_detected_booking": booking_id,
                    "note": "🛑 Charging stopped successfully! Refund processed based on actual consumption."
                })
                
            return result
            
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    elif tool_name == "get_station_battery_capacity":
        """Get the current battery capacity and status of a charging station by calling its /battery endpoint."""
        station_id = kwargs.get("station_id")
        try:
            if station_id is None:
                return {"success": False, "error": "station_id parameter is required", "example": {"station_id": 1}}
            
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

    elif tool_name == "find_nearest_charging_station":
        """Find the nearest charging stations to the user's location using the Haversine algorithm."""
        user_latitude = kwargs.get("user_latitude")
        user_longitude = kwargs.get("user_longitude")
        try:
            max_results = kwargs.get("max_results", 5)
            
            if user_latitude is None or user_longitude is None:
                return {
                    "success": False,
                    "error": "user_latitude and user_longitude parameters are required",
                    "example": {"user_latitude": 40.7128, "user_longitude": -74.0060, "max_results": 5}
                }
            
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
                    "pricePerWattSei": blockchain.wei_to_sei(result[3][i]),
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
    
    elif tool_name == "estimate_charging_time":
        """Estimate charging time for a station by calling its /estimate endpoint with energy needs and power rate."""
        station_id = kwargs.get("station_id")
        energy_wh = kwargs.get("energy_wh")
        power_rate = kwargs.get("power_rate")
        
        try:
            if station_id is None:
                return {"success": False, "error": "station_id parameter is required", "example": {"station_id": 1, "energy_wh": 1000, "power_rate": 0.8}}
            
            if energy_wh is None:
                return {"success": False, "error": "energy_wh parameter is required", "example": {"station_id": 1, "energy_wh": 1000, "power_rate": 0.8}}
                
            if power_rate is None:
                return {"success": False, "error": "power_rate parameter is required", "example": {"station_id": 1, "energy_wh": 1000, "power_rate": 0.8}}
            
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
    # All other tools
    else:
        available_tools = [
            "health_check", "get_server_info", "get_user_balance", "get_gas_estimates",
            "get_all_charging_points", "calculate_charging_price", "buy_power_from_station",
            "stop_charging", "get_user_bookings", "get_booking_details",
            "prebook_charging_session", "get_booking_count", "get_contract_balance",
            "get_station_battery_capacity", "find_nearest_charging_station", "estimate_charging_time",
            "emergency_device_stop", "diagnose_user_wallet"
        ]
        return {"error": f"Tool '{tool_name}' not available via HTTP API", "available_tools": available_tools}


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