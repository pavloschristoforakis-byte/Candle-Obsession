
// Load saved shopping cart
let cart = JSON.parse(localStorage.getItem("cart")) || [];

// Add product to cart
function addToCart(name, price) {

    let existingProduct = cart.find(
        product => product.name === name
    );

    if (existingProduct) {
        existingProduct.quantity++;
    } else {
        cart.push({
            name: name,
            price: price,
            quantity: 1
        });
    }

    updateCart();
}

// Increase product quantity
function increaseQuantity(index) {

    cart[index].quantity++;

    updateCart();
}

// Decrease product quantity
function decreaseQuantity(index) {

    cart[index].quantity--;

    if (cart[index].quantity <= 0) {
        cart.splice(index, 1);
    }

    updateCart();
}

// Remove product
function removeProduct(index) {

    cart.splice(index, 1);

    updateCart();
}

// Save shopping cart
function saveCart() {

    localStorage.setItem("cart", JSON.stringify(cart));
}

// Update navigation counter
function updateCartCount() {

    let totalQuantity = cart.reduce(
        (total, product) => total + product.quantity, 0
    );

    document.getElementById("cart-count").textContent =
        totalQuantity;
}

// Calculate total price
function calculateTotal() {

    return cart.reduce(
        (total, product) =>
            total + product.price * product.quantity, 0
    );
}

// Display shopping cart products
function displayCart() {

    let cartItems = document.getElementById("cart-items");

    if (!cartItems) return;

    cartItems.innerHTML = "";

    if (cart.length === 0) {

        cartItems.innerHTML = "<p>Your cart is empty.</p>";

    } else {

        cart.forEach((product, index) => {

            cartItems.innerHTML += `
                <div class="cart-item">

                    <div>
                        <h3>${product.name}</h3>
                        <p>€${product.price.toFixed(2)}</p>
                    </div>

                    <div class="cart-quantity">

                        <button onclick="decreaseQuantity(${index})">
                            -
                        </button>

                        <span>${product.quantity}</span>

                        <button onclick="increaseQuantity(${index})">
                            +
                        </button>

                    </div>

                    <p>
                        €${(product.price * product.quantity).toFixed(2)}
                    </p>

                    <button class="remove-button"
                            onclick="removeProduct(${index})">
                        Remove
                    </button>

                </div>
            `;
        });
    }

    document.getElementById("cart-total").textContent =
        calculateTotal().toFixed(2);
}

// Update everything
function updateCart() {

    saveCart();
    updateCartCount();
    displayCart();
}

// Initialize shopping cart
document.addEventListener("DOMContentLoaded", function () {

    updateCartCount();
    displayCart();

});

// Open checkout page
function goToCheckout() {

    if (cart.length === 0) {
        alert("Your shopping cart is empty.");
        return;
    }

    window.location.href = "/Checkout";
}

// Display checkout order summary
function displayCheckout() {

    const container = document.getElementById("checkout-items");

    if (!container) return;

    container.innerHTML = "";

    cart.forEach(product => {

        const item = document.createElement("div");
        item.className = "checkout-item";

        const name = document.createElement("span");
        name.textContent = product.name + " × " + product.quantity;

        const price = document.createElement("span");
        price.textContent =
            "€" + (product.price * product.quantity).toFixed(2);

        item.append(name, price);
        container.appendChild(item);
    });

    document.getElementById("checkout-total").textContent =
        calculateTotal().toFixed(2);

    if (cart.length === 0) {

        container.textContent = "Your cart is empty.";

        document.querySelector(".place-order-button").disabled = true;
    }
}


// Initialize checkout
document.addEventListener("DOMContentLoaded", function () {

    displayCheckout();

    const form = document.getElementById("checkout-form");

    if (form) {
        form.addEventListener("submit", placeOrder);
    }

});

// DELIVERY PRICES
const shippingPrices = {
    acs: 5.00,
    boxnow: 3.00
};

// Calculate shipping and final total
function updateShipping() {

    const selectedMethod = document.querySelector(
        'input[name="deliveryMethod"]:checked'
    );

    const shippingCost = document.getElementById("shipping-cost");
    const finalTotal = document.getElementById("final-total");

    if (!selectedMethod || !shippingCost || !finalTotal) {
        return;
    }

    const subtotal = calculateTotal();

    const shipping = cart.length > 0
        ? shippingPrices[selectedMethod.value]
        : 0;

    shippingCost.textContent = shipping.toFixed(2);

    finalTotal.textContent =
        (subtotal + shipping).toFixed(2);
}

// Initialize shipping on checkout page
document.addEventListener("DOMContentLoaded", function () {

    updateShipping();

});

// Switch between ACS and BOX NOW delivery fields

function updateDeliveryFields() {

    const selectedMethod = document.querySelector(
        'input[name="deliveryMethod"]:checked'
    );

    const acsDetails = document.getElementById("acs-details");

    const boxnowDetails =
        document.getElementById("boxnow-details");

    if (!selectedMethod || !acsDetails || !boxnowDetails) {
        return;
    }

    const isACS = selectedMethod.value === "acs";

    acsDetails.style.display = isACS ? "block" : "none";

    boxnowDetails.style.display = isACS ? "none" : "block";

    acsDetails.querySelectorAll("input, select").forEach(field => {

        field.disabled = !isACS;

        if (field.tagName === "INPUT") {
            field.required = isACS;
        }

    });

    boxnowDetails.querySelectorAll("input").forEach(field => {

        field.disabled = isACS;
        field.required = !isACS;

    });

    updateShipping();
}

document.addEventListener("DOMContentLoaded", function () {

    document.querySelectorAll(
        'input[name="deliveryMethod"]'
    ).forEach(option => {

        option.addEventListener("change", updateDeliveryFields);

    });

    updateDeliveryFields();

});

// PAYMENT METHOD AVAILABILITY

function updatePaymentMethods() {

    const delivery = document.querySelector(
        'input[name="deliveryMethod"]:checked'
    );

    const cashOption = document.getElementById("cash-payment");

    const cashInput = document.querySelector(
        'input[name="paymentMethod"][value="cash"]'
    );

    const cardInput = document.querySelector(
        'input[name="paymentMethod"][value="card"]'
    );

    if (!delivery || !cashOption || !cashInput || !cardInput) {
        return;
    }

    const isBoxNow = delivery.value === "boxnow";

    cashInput.disabled = isBoxNow;

    cashOption.classList.toggle("payment-disabled", isBoxNow);

    if (isBoxNow && cashInput.checked) {
        cardInput.checked = true;
    }
}

document.addEventListener("DOMContentLoaded", function () {

    document.querySelectorAll(
        'input[name="deliveryMethod"]'
    ).forEach(option => {

        option.addEventListener("change", updatePaymentMethods);

    });

    updatePaymentMethods();

});

// Submit order to the database
let isSubmittingOrder = false;

async function placeOrder(event) {

    event.preventDefault();

    if (isSubmittingOrder) return;

    const form = document.getElementById("checkout-form");

    const message = document.getElementById("checkout-message");

    const button = document.querySelector(".place-order-button");

    if (cart.length === 0) {
        message.textContent = "Your shopping cart is empty.";
        return;
    }

    if (!form.reportValidity()) {
        return;
    }

    const formData = new FormData(form);

    const token = formData.get("__RequestVerificationToken");

    if (!token) {
        message.textContent = "Security token is missing. Refresh the page.";
        return;
    }

    // Prepare order information
    const order = {

        firstName: formData.get("firstName"),
        lastName: formData.get("lastName"),
        email: formData.get("email"),
        phone: formData.get("phone"),

        deliveryMethod: formData.get("deliveryMethod"),

        address: formData.get("address"),
        city: formData.get("city"),
        postalCode: formData.get("postalCode"),
        country: "Cyprus",
        locker: formData.get("locker"),

        paymentMethod: formData.get("paymentMethod"),

        notes: formData.get("notes"),

        items: cart.map(product => ({
            name: product.name,
            quantity: product.quantity
        }))
    };

    // Prevent duplicate clicks
    isSubmittingOrder = true;

    button.disabled = true;
    button.textContent = "Processing Order...";

    message.textContent = "";

    let orderSaved = false;

    try {

        const response = await fetch("/Checkout?handler=PlaceOrder", {

            method: "POST",

            headers: {
                "Content-Type": "application/json",
                "RequestVerificationToken": token
            },

            body: JSON.stringify(order)

        });

        const result = await response.json();

        if (!response.ok || !result.success) {

            message.textContent =
                result.message || "Unable to place order.";

            return;
        }

        orderSaved = true;

        // Clear shopping cart after successful order
        cart = [];

        saveCart();
        updateCartCount();
        displayCheckout();
        updateShipping();

        // Display successful order message
        message.textContent =
            "Order #" + result.orderId +
            " placed successfully! Total: €" +
            Number(result.total).toFixed(2) +
            ". Payment pending.";

        form.reset();

        updateDeliveryFields();
        updatePaymentMethods();

        button.textContent = "Order Placed";

    } catch (error) {

        console.error("Checkout error:", error);

        message.textContent =
            "Unable to confirm the order. Check before submitting again.";

    } finally {

        isSubmittingOrder = false;

        if (!orderSaved) {

            button.disabled = cart.length === 0;
            button.textContent = "Place Order";

        }
    }
}
