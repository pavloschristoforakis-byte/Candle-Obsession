
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Candle_Obsession.Data;
using Candle_Obsession.Models;

namespace Candle_Obsession.Pages
{
    public class CheckoutModel : PageModel
    {
        private readonly ApplicationDbContext _context;

        public CheckoutModel(ApplicationDbContext context)
        {
            _context = context;
        }

        public void OnGet()
        {
        }

        public async Task<IActionResult> OnPostPlaceOrderAsync(
            [FromBody] CheckoutRequest request)
        {
            // Validate customer information
            if (request == null || !ModelState.IsValid)
            {
                return BadRequest(new
                {
                    message = "Invalid customer information."
                });
            }

            // Validate shopping cart
            if (request.Items == null || request.Items.Count == 0)
            {
                return BadRequest(new
                {
                    message = "Your cart is empty."
                });
            }

            // Validate delivery method
            if (request.DeliveryMethod != "acs" &&
                request.DeliveryMethod != "boxnow")
            {
                return BadRequest(new
                {
                    message = "Invalid delivery method."
                });
            }

            // Validate payment method
            if (request.PaymentMethod != "card" &&
                request.PaymentMethod != "revolut" &&
                request.PaymentMethod != "cash")
            {
                return BadRequest(new
                {
                    message = "Invalid payment method."
                });
            }

            // Validate delivery details
            if (request.DeliveryMethod == "acs")
            {
                if (string.IsNullOrWhiteSpace(request.Address) ||
                    string.IsNullOrWhiteSpace(request.City) ||
                    string.IsNullOrWhiteSpace(request.PostalCode))
                {
                    return BadRequest(new
                    {
                        message = "Please complete your delivery address."
                    });
                }
            }

            if (request.DeliveryMethod == "boxnow")
            {
                if (string.IsNullOrWhiteSpace(request.Locker))
                {
                    return BadRequest(new
                    {
                        message = "Please select a BOX NOW locker."
                    });
                }

                if (request.PaymentMethod == "cash")
                {
                    return BadRequest(new
                    {
                        message = "Cash is unavailable for BOX NOW."
                    });
                }
            }

            // Calculate shipping cost
            decimal shippingCost =
                request.DeliveryMethod == "acs" ? 5.00m : 3.00m;

            decimal subtotal = 0;

            List<OrderItem> orderItems = new();
            HashSet<string> productNames = new();

            // Validate products and calculate prices
            foreach (var item in request.Items)
            {
                if (item == null ||
                    string.IsNullOrWhiteSpace(item.Name) ||
                    item.Quantity < 1 || item.Quantity > 100)
                {
                    return BadRequest(new
                    {
                        message = "Invalid product or quantity."
                    });
                }

                if (!ProductCatalog.TryGetPrice(item.Name, out decimal price))
                {
                    return BadRequest(new
                    {
                        message = "Invalid product."
                    });
                }

                if (!productNames.Add(item.Name))
                {
                    return BadRequest(new
                    {
                        message = "Duplicate product in cart."
                    });
                }

                decimal totalPrice = price * item.Quantity;

                subtotal += totalPrice;

                orderItems.Add(new OrderItem
                {
                    ProductName = item.Name,
                    UnitPrice = price,
                    Quantity = item.Quantity,
                    TotalPrice = totalPrice
                });
            }

            // Create the order
            var order = new Order
            {
                FirstName = request.FirstName,
                LastName = request.LastName,
                Email = request.Email,
                Phone = request.Phone,

                DeliveryMethod = request.DeliveryMethod,

                Address = request.DeliveryMethod == "acs"
                    ? request.Address : null,

                City = request.DeliveryMethod == "acs"
                    ? request.City : null,

                PostalCode = request.DeliveryMethod == "acs"
                    ? request.PostalCode : null,

                Country = "Cyprus",

                Locker = request.DeliveryMethod == "boxnow"
                    ? request.Locker : null,

                PaymentMethod = request.PaymentMethod,
                PaymentStatus = "Pending",

                Subtotal = subtotal,
                ShippingCost = shippingCost,
                Total = subtotal + shippingCost,

                Notes = request.Notes,
                OrderStatus = "Pending",
                OrderDate = DateTime.UtcNow,

                OrderItems = orderItems
            };

            // Save order to database
            _context.Orders.Add(order);

            await _context.SaveChangesAsync();

            // Return successful response
            return new JsonResult(new
            {
                success = true,
                orderId = order.Id,
                total = order.Total,
                message = "Order placed successfully!"
            });
        }
    }
}
