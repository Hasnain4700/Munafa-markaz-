import { auth, database } from '../firebase-init.js';
let currentWorkerId = null;
let currentWorkerName = null;
let orders = {};

// DOM Elements
const loaderOverlay = document.getElementById('loaderOverlay');
const modal = document.getElementById('newOrderModal');
const newOrderBtn = document.getElementById('newOrderBtn');
const closeBtn = document.querySelector('.close');
const orderForm = document.getElementById('newOrderForm');
const ordersTableBody = document.getElementById('ordersTableBody');

// Stats Elements
const totalOrdersEl = document.getElementById('totalOrders');
const pendingOrdersEl = document.getElementById('pendingOrders');
const completedOrdersEl = document.getElementById('completedOrders');
const cancelledOrdersEl = document.getElementById('cancelledOrders');
const totalProfitEl = document.getElementById('totalProfit');

// Withdraw Elements
const withdrawModal = document.getElementById('withdrawModal');
const withdrawBtn = document.getElementById('withdrawBtn');
const withdrawForm = document.getElementById('withdrawForm');
const availableBalance = document.getElementById('availableBalance');

// Notifications Elements
const notificationsBtn = document.getElementById('notificationsBtn');
const notificationsSection = document.getElementById('notificationsSection');
const notificationsList = document.getElementById('notificationsList');

// Profile Elements
const profileBtn = document.getElementById('profileBtn');
const profileModal = document.getElementById('profileModal');
const closeProfileModal = document.getElementById('closeProfileModal');
const profileForm = document.getElementById('profileForm');
const profileNameInput = document.getElementById('profileName');
const profileEmailInput = document.getElementById('profileEmail');
const profileSuccessMessage = document.getElementById('profileSuccess');
const profileErrorMessage = document.getElementById('profileError');

// Change Password Logic
const changePasswordForm = document.getElementById('changePasswordForm');
const currentPasswordInput = document.getElementById('currentPassword');
const newPasswordInput = document.getElementById('newPassword');
const confirmNewPasswordInput = document.getElementById('confirmNewPassword');
const passwordSuccess = document.getElementById('passwordSuccess');
const passwordError = document.getElementById('passwordError');
if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!auth.currentUser) return;
        passwordSuccess.style.display = 'none';
        passwordError.style.display = 'none';
        const currentPassword = currentPasswordInput.value;
        const newPassword = newPasswordInput.value;
        const confirmNewPassword = confirmNewPasswordInput.value;
        if (!currentPassword || !newPassword || !confirmNewPassword) {
            passwordError.textContent = 'All fields are required.';
            passwordError.style.display = 'block';
            return;
        }
        if (newPassword !== confirmNewPassword) {
            passwordError.textContent = 'New passwords do not match.';
            passwordError.style.display = 'block';
            return;
        }
        // Re-authenticate user
        const user = auth.currentUser;
        const email = user.email;
        const credential = firebase.auth.EmailAuthProvider.credential(email, currentPassword);
        try {
            await user.reauthenticateWithCredential(credential);
            await user.updatePassword(newPassword);
            passwordSuccess.textContent = 'Password changed successfully!';
            passwordSuccess.style.display = 'block';
            passwordError.style.display = 'none';
            changePasswordForm.reset();
        } catch (error) {
            passwordError.textContent = error.message;
            passwordError.style.display = 'block';
            passwordSuccess.style.display = 'none';
        }
    });
}

// Modal Controls
if (newOrderBtn && modal) {
newOrderBtn.addEventListener('click', () => {
    modal.style.display = 'block';
});
}
if (withdrawBtn && withdrawModal && availableBalance) {
withdrawBtn.addEventListener('click', () => {
    // Always fetch latest orders and withdrawals from Firebase
    Promise.all([
        database.ref('orders').once('value'),
        database.ref('withdrawalRequests').once('value')
    ]).then(([ordersSnapshot, withdrawalsSnapshot]) => {
        const allOrders = ordersSnapshot.val() || {};
        const withdrawals = withdrawalsSnapshot.val() || {};
        // Calculate total profit from completed orders only
        const totalProfit = Object.values(allOrders).reduce((total, order) => {
            if (order.workerId === currentWorkerId && order.status === 'completed') {
                total += order.profit;
            }
            return total;
        }, 0);
        // Calculate total completed withdrawals
        const completedWithdrawals = Object.values(withdrawals)
            .filter(w => w.workerId === currentWorkerId && w.status === 'completed')
            .reduce((total, w) => total + w.amount, 0);
        // Calculate actual available balance
        const actualBalance = totalProfit - completedWithdrawals;
            availableBalance.textContent = `PKR ${actualBalance.toFixed(2)}`;
        withdrawModal.style.display = 'block';
    });
    });
}

profileBtn.addEventListener('click', () => {
    profileModal.style.display = 'block';
    // Load current profile data
    database.ref(`workers/${currentWorkerId}`).once('value')
        .then(snapshot => {
            const worker = snapshot.val();
            if (worker) {
                profileNameInput.value = worker.name;
                profileEmailInput.value = worker.email;
            }
        })
        .catch(error => {
            console.error('Error loading profile data:', error);
            showNotification('Error loading profile data', 'error');
        });
    // Load last login and created at from Firebase Auth
    const user = auth.currentUser;
    if (user) {
        const lastLoginInput = document.getElementById('profileLastLogin');
        const createdAtInput = document.getElementById('profileCreatedAt');
        if (lastLoginInput) lastLoginInput.value = user.metadata.lastSignInTime ? new Date(user.metadata.lastSignInTime).toLocaleString() : '';
        if (createdAtInput) createdAtInput.value = user.metadata.creationTime ? new Date(user.metadata.creationTime).toLocaleString() : '';
    }
});

// Notifications button click handler
notificationsBtn.addEventListener('click', () => {
    // Hide all sections
    document.querySelector('.container').style.display = 'none';
    notificationsSection.style.display = 'block';
    
    // Load notifications for current worker
    loadNotifications();
});

// Load notifications for current worker (card style)
function loadNotifications() {
    if (!currentWorkerId) return;
    const notificationsList = document.getElementById('notificationsList');
    notificationsList.innerHTML = '';
    database.ref(`notifications/${currentWorkerId}`).orderByChild('timestamp').once('value')
        .then((snapshot) => {
            const notifications = [];
            let unreadCount = 0;
            snapshot.forEach((notifSnapshot) => {
                const notification = notifSnapshot.val();
                if (!notification.read) unreadCount++;
                notifications.push({
                    id: notifSnapshot.key,
                    ...notification
                });
            });
            // Update badge
            const badge = document.getElementById('notificationBadge');
            if (badge) {
                if (unreadCount > 0) {
                    badge.textContent = unreadCount;
                    badge.style.display = 'inline-block';
                } else {
                    badge.style.display = 'none';
                }
            }
            // Sort by timestamp (newest first)
            notifications.sort((a, b) => b.timestamp - a.timestamp);
            let expandedCard = null;
            notifications.forEach((notif) => {
                const card = document.createElement('div');
                card.className = 'notification-card' + (notif.read ? ' read' : ' unread');
                const preview = notif.message.length > 80 ? notif.message.slice(0, 80) + '...' : notif.message;
                card.innerHTML = `
                    <div class="notif-title">${notif.title}</div>
                    <div class="notif-date">${formatDate(notif.timestamp)}</div>
                    <div class="notif-preview">${preview}</div>
                    <span class="notif-badge">${notif.read ? 'Read' : 'Unread'}</span>
                `;
                card.addEventListener('click', () => {
                    // Collapse any expanded card
                    if (expandedCard && expandedCard !== card) {
                        const open = expandedCard.querySelector('.notif-full-message');
                        if (open) open.remove();
                        expandedCard.classList.remove('expanded');
                    }
                    // Toggle expand/collapse
                    if (!card.classList.contains('expanded')) {
                        card.classList.add('expanded');
                        const fullMsg = document.createElement('div');
                        fullMsg.className = 'notif-full-message';
                        fullMsg.textContent = notif.message;
                        card.appendChild(fullMsg);
                        expandedCard = card;
                    } else {
                        const open = card.querySelector('.notif-full-message');
                        if (open) open.remove();
                        card.classList.remove('expanded');
                        expandedCard = null;
                    }
                    // Mark as read if not already
                    if (!notif.read) {
                        database.ref(`notifications/${currentWorkerId}/${notif.id}`).update({ read: true });
                        card.querySelector('.notif-badge').textContent = 'Read';
                        card.classList.remove('unread');
                        card.classList.add('read');
                        // Update badge count
                        if (badge) {
                            let count = parseInt(badge.textContent) || 0;
                            count = Math.max(0, count - 1);
                            if (count > 0) {
                                badge.textContent = count;
                                badge.style.display = 'inline-block';
                            } else {
                                badge.style.display = 'none';
                            }
                        }
                    }
                });
                notificationsList.appendChild(card);
            });
        })
        .catch(error => {
            console.error('Error loading notifications:', error);
            showNotification('Error loading notifications', 'error');
        });
}

// Helper function to format date
function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Add click handler to go back to main dashboard
document.addEventListener('click', (e) => {
    if (e.target.textContent === 'Home' || e.target.closest('a[href="#"]')) {
        if (e.target.textContent === 'Home') {
            notificationsSection.style.display = 'none';
            document.querySelector('.container').style.display = 'block';
        }
    }
});

// Close buttons for all modals
document.querySelectorAll('.close').forEach(btn => {
    btn.addEventListener('click', () => {
        modal.style.display = 'none';
        withdrawModal.style.display = 'none';
        profileModal.style.display = 'none';
    });
});

window.addEventListener('click', (event) => {
    if (event.target === modal) {
        modal.style.display = 'none';
    }
    if (event.target === withdrawModal) {
        withdrawModal.style.display = 'none';
    }
    if (event.target === profileModal) {
        profileModal.style.display = 'none';
    }
});

// Handle New Order Submission
if (orderForm) {
orderForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const newOrder = {
        customerName: document.getElementById('customerName').value,
        address: document.getElementById('address').value,
        phone: document.getElementById('phone').value,
        productCode: document.getElementById('productCode').value,
        profit: parseFloat(document.getElementById('profit').value),
        status: 'pending',
        timestamp: Date.now(),
        workerId: currentWorkerId,
        workerName: currentWorkerName
    };

    // Push new order to Firebase
    database.ref('orders').push(newOrder)
        .then(() => {
            modal.style.display = 'none';
            orderForm.reset();
            showNotification('Order added successfully!', 'success');
        })
        .catch(error => {
            showNotification('Error adding order: ' + error.message, 'error');
        });
});
}

// Update Orders Table: Active = pending + delivered, History = completed + cancelled
function updateOrdersTable(orders) {
    if (!currentWorkerId) return;
    ordersTableBody.innerHTML = '';
    const orderHistoryTableBody = document.getElementById('orderHistoryTableBody');
    orderHistoryTableBody.innerHTML = '';
    Object.entries(orders).forEach(([id, order]) => {
        if (order.workerId === currentWorkerId) {
            if (order.status === 'pending' || order.status === 'delivered') {
                // Active Orders: pending or delivered
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${id.slice(-6).toUpperCase()}</td>
                <td>${order.customerName}</td>
                <td>${order.productCode}</td>
                <td>${order.address}</td>
                <td>${order.phone}</td>
                    <td>PKR ${order.profit.toFixed(2)}</td>
                <td>
                    <span class="status-badge status-${order.status}">
                        ${order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                    </span>
                </td>
            `;
            ordersTableBody.appendChild(row);
            } else if (order.status === 'completed' || order.status === 'cancelled') {
                // Order History: completed or cancelled
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${id.slice(-6).toUpperCase()}</td>
                    <td>${order.customerName}</td>
                    <td>${order.productCode}</td>
                    <td>${order.address}</td>
                    <td>${order.phone}</td>
                    <td>PKR ${order.profit.toFixed(2)}</td>
                    <td>
                        <span class="status-badge status-${order.status}">
                            ${order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                        </span>
                    </td>
                    <td>${order.completedAt ? new Date(order.completedAt).toLocaleString() : (order.timestamp ? new Date(order.timestamp).toLocaleString() : '')}</td>
                `;
                orderHistoryTableBody.appendChild(row);
            }
        }
    });
}

// Update Stats
function updateStats(orders) {
    if (!currentWorkerId) return;
    console.log('Updating stats with currentWorkerId:', currentWorkerId);
    const stats = Object.values(orders).reduce((acc, order) => {
        // Only count orders for current worker
        if (order.workerId === currentWorkerId) {
            acc.total++;
            acc[order.status]++;
            // Only add profit for completed orders
            if (order.status === 'completed') {
                acc.totalProfit += order.profit;
            }
        }
        return acc;
    }, {
        total: 0,
        pending: 0,
        completed: 0,
        cancelled: 0,
        delivered: 0,
        totalProfit: 0
    });
    // Fetch withdrawals and subtract completed withdrawals from totalProfit
    database.ref('withdrawalRequests').once('value').then(snapshot => {
        const withdrawals = snapshot.val() || {};
        const completedWithdrawals = Object.values(withdrawals)
            .filter(w => w.workerId === currentWorkerId && w.status === 'completed')
            .reduce((total, w) => total + w.amount, 0);
        console.log('Completed Orders Profit:', stats.totalProfit);
        console.log('Completed Withdrawals Total:', completedWithdrawals);
        const netProfit = Math.max(0, stats.totalProfit - completedWithdrawals);
        console.log('Net Profit (should show on dashboard):', netProfit);
        totalOrdersEl.textContent = stats.total;
        pendingOrdersEl.textContent = stats.pending;
        completedOrdersEl.textContent = stats.completed;
        cancelledOrdersEl.textContent = stats.cancelled;
        totalProfitEl.textContent = `PKR ${netProfit.toFixed(2)}`;
    });
}

// Notification System
function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `notification ${type} animate-slide-in-top`;
    notification.textContent = message;
    
    // Add icon based on type
    const icon = document.createElement('i');
    icon.className = type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle';
    icon.style.marginRight = '0.5rem';
    notification.insertBefore(icon, notification.firstChild);
    
    document.body.appendChild(notification);
    
    // Add hover effect
    notification.addEventListener('mouseenter', () => {
        notification.style.transform = 'translateY(-2px)';
        notification.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.3)';
    });
    
    notification.addEventListener('mouseleave', () => {
        notification.style.transform = 'translateY(0)';
        notification.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.2)';
    });
    
    // Auto remove with fade out
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(-20px)';
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// Enhanced button click animations
function addButtonAnimations() {
    const buttons = document.querySelectorAll('.btn-primary, button');
    buttons.forEach(button => {
        button.addEventListener('click', function(e) {
            // Create ripple effect
            const ripple = document.createElement('span');
            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const x = e.clientX - rect.left - size / 2;
            const y = e.clientY - rect.top - size / 2;
            
            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = x + 'px';
            ripple.style.top = y + 'px';
            ripple.classList.add('ripple');
            
            this.appendChild(ripple);
            
            setTimeout(() => {
                ripple.remove();
            }, 600);
        });
    });
}

// Add ripple effect CSS
const rippleCSS = `
.ripple {
    position: absolute;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.6);
    transform: scale(0);
    animation: ripple-animation 0.6s linear;
    pointer-events: none;
}

@keyframes ripple-animation {
    to {
        transform: scale(4);
        opacity: 0;
    }
}
`;

// Inject ripple CSS
const style = document.createElement('style');
style.textContent = rippleCSS;
document.head.appendChild(style);

// Enhanced table row animations
function enhanceTableAnimations() {
    const tableRows = document.querySelectorAll('tbody tr');
    tableRows.forEach(row => {
        row.addEventListener('mouseenter', function() {
            this.style.transform = 'scale(1.01)';
            this.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
        });
        
        row.addEventListener('mouseleave', function() {
            this.style.transform = 'scale(1)';
            this.style.boxShadow = 'none';
        });
    });
}

// Enhanced modal animations
function enhanceModalAnimations() {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        const modalContent = modal.querySelector('.modal-content');
        
        // Enhanced modal open animation
        modal.addEventListener('show', function() {
            modalContent.style.transform = 'scale(0.8)';
            modalContent.style.opacity = '0';
            
            setTimeout(() => {
                modalContent.style.transform = 'scale(1)';
                modalContent.style.opacity = '1';
            }, 10);
        });
        
        // Enhanced modal close animation
        modal.addEventListener('hide', function() {
            modalContent.style.transform = 'scale(0.8)';
            modalContent.style.opacity = '0';
        });
    });
}

// Enhanced status badge animations
function enhanceStatusBadgeAnimations() {
    const statusBadges = document.querySelectorAll('.status-badge');
    statusBadges.forEach(badge => {
        badge.addEventListener('mouseenter', function() {
            this.style.transform = 'scale(1.1)';
            this.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
        });
        
        badge.addEventListener('mouseleave', function() {
            this.style.transform = 'scale(1)';
            this.style.boxShadow = 'none';
        });
    });
}

// Enhanced form animations
function enhanceFormAnimations() {
    const formInputs = document.querySelectorAll('input, select, textarea');
    formInputs.forEach(input => {
        input.addEventListener('focus', function() {
            this.parentElement.style.transform = 'scale(1.02)';
        });
        
        input.addEventListener('blur', function() {
            this.parentElement.style.transform = 'scale(1)';
        });
    });
}

// Loading animation for async operations
function showLoadingAnimation(element) {
    element.classList.add('loading');
    element.style.pointerEvents = 'none';
}

function hideLoadingAnimation(element) {
    element.classList.remove('loading');
    element.style.pointerEvents = 'auto';
}

// Success/Error state animations
function showSuccessState(element) {
    element.classList.add('success-state');
    setTimeout(() => {
        element.classList.remove('success-state');
    }, 600);
}

function showErrorState(element) {
    element.classList.add('error-state');
    setTimeout(() => {
        element.classList.remove('error-state');
    }, 600);
}

// Enhanced order status update with animations
async function updateOrderStatusWithAnimation(orderId, workerId, newStatus, selectElement) {
    const oldStatus = selectElement.value;
    
    try {
        showLoadingAnimation(selectElement);
        
        await database.ref(`orders/${orderId}`).update({
            status: newStatus
        });

        if (newStatus === 'completed' && oldStatus !== 'completed') {
            const workerRef = database.ref(`workers/${workerId}`);
            const workerSnapshot = await workerRef.once('value');
            const worker = workerSnapshot.val() || {};
            await workerRef.update({
                earnings: (worker.earnings || 0) + orders[orderId].profit,
                completedOrders: (worker.completedOrders || 0) + 1
            });
        } else if (oldStatus === 'completed' && newStatus !== 'completed') {
            const workerRef = database.ref(`workers/${workerId}`);
            const workerSnapshot = await workerRef.once('value');
            const worker = workerSnapshot.val() || {};
            await workerRef.update({
                earnings: Math.max(0, (worker.earnings || 0) - orders[orderId].profit),
                completedOrders: Math.max(0, (worker.completedOrders || 0) - 1)
            });
        }

        hideLoadingAnimation(selectElement);
        showSuccessState(selectElement);
        showNotification('Order status updated successfully!', 'success');
    } catch (error) {
        hideLoadingAnimation(selectElement);
        showErrorState(selectElement);
        showNotification('Error updating status: ' + error.message, 'error');
        selectElement.value = oldStatus;
    }
}

// Initialize all animations when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    addAnimationClasses();
    addButtonAnimations();
    enhanceTableAnimations();
    enhanceModalAnimations();
    enhanceStatusBadgeAnimations();
    enhanceFormAnimations();
    
    // Add staggered entrance animation to page elements
    const elements = document.querySelectorAll('.stat-card, .orders-section, .withdrawal-section');
    elements.forEach((element, index) => {
        element.style.opacity = '0';
        element.style.transform = 'translateY(30px)';
        
        setTimeout(() => {
            element.style.transition = 'all 0.6s ease-out';
            element.style.opacity = '1';
            element.style.transform = 'translateY(0)';
        }, index * 100);
    });
});

// Handle Withdraw Form Submission
if (withdrawForm) {
withdrawForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = parseFloat(document.getElementById('withdrawAmount').value);
    const paymentMethod = document.getElementById('paymentMethod').value;
    const accountHolder = document.getElementById('accountHolder').value;
    const accountNumber = document.getElementById('accountNumber').value;
    try {
        // Get all withdrawal requests
        const withdrawalSnapshot = await database.ref('withdrawalRequests').once('value');
        const withdrawals = withdrawalSnapshot.val() || {};
        // Calculate total profit from completed orders only
        const workerOrders = Object.values(orders || {})
            .filter(order => order.workerId === currentWorkerId && order.status === 'completed');
        console.log('Worker Orders:', workerOrders);
        const totalProfit = workerOrders
            .reduce((total, order) => total + order.profit, 0);
        console.log('Total Profit:', totalProfit);
        // Calculate total completed withdrawals
        const workerWithdrawals = Object.values(withdrawals)
            .filter(w => w.workerId === currentWorkerId && w.status === 'completed');
        console.log('Completed Withdrawals:', workerWithdrawals);
        const completedWithdrawals = workerWithdrawals
            .reduce((total, w) => total + w.amount, 0);
        console.log('Total Completed Withdrawals:', completedWithdrawals);
        // Calculate actual available balance
        const actualBalance = totalProfit - completedWithdrawals;
        console.log('Available Balance:', actualBalance);
        console.log('Requested Withdrawal Amount:', amount);
        // Validate withdrawal amount
        if (amount < 200 || amount > 50000) {
                showNotification('Withdrawal amount must be between PKR 200 and PKR 50,000', 'error');
            return;
        }
        if (amount > actualBalance) {
                showNotification(`Insufficient balance. Available: PKR ${actualBalance}, Requested: PKR ${amount}`, 'error');
            return;
        }
        // Create withdrawal request
        const withdrawalRequest = {
            workerId: currentWorkerId,
            workerName: currentWorkerName,
            amount: amount,
            paymentMethod: paymentMethod,
            accountHolder: accountHolder,
            accountNumber: accountNumber,
            status: 'pending',
            timestamp: Date.now()
        };
        // Push withdrawal request to Firebase
        await database.ref('withdrawalRequests').push(withdrawalRequest);
        withdrawModal.style.display = 'none';
        withdrawForm.reset();
        showNotification('Withdrawal request submitted successfully!', 'success');
    } catch (error) {
        console.error('Error in withdrawal submission:', error);
        showNotification('Error submitting withdrawal request: ' + error.message, 'error');
    }
});
}

// Handle Profile Form Submission
if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newName = profileNameInput.value;
        const newEmail = profileEmailInput.value; // Email is read-only
        const errorMessage = profileErrorMessage;
        const successMessage = profileSuccessMessage;
        errorMessage.style.display = 'none';
        successMessage.style.display = 'none';

        if (!newName) {
            errorMessage.textContent = 'Name cannot be empty.';
            errorMessage.style.display = 'block';
            return;
        }

        try {
            await database.ref(`workers/${currentWorkerId}`).update({ name: newName });
            currentWorkerName = newName;
            document.getElementById('workerName').textContent = currentWorkerName;
            successMessage.textContent = 'Profile updated successfully!';
            successMessage.style.display = 'block';
        } catch (error) {
            errorMessage.textContent = 'Error updating profile: ' + error.message;
            errorMessage.style.display = 'block';
            console.error('Error updating profile:', error);
        }
    });
}

// Add logic for order history tab
const showOrderHistoryBtn = document.getElementById('showOrderHistoryBtn');
const backToActiveOrdersBtn = document.getElementById('backToActiveOrdersBtn');
const activeOrdersTableSection = document.getElementById('activeOrdersTableSection');
const orderHistoryTableSection = document.getElementById('orderHistoryTableSection');
const orderHistoryTableBody = document.getElementById('orderHistoryTableBody');

if (showOrderHistoryBtn && backToActiveOrdersBtn && activeOrdersTableSection && orderHistoryTableSection) {
    showOrderHistoryBtn.addEventListener('click', () => {
        activeOrdersTableSection.style.display = 'none';
        orderHistoryTableSection.style.display = 'block';
        showOrderHistoryBtn.style.display = 'none';
        backToActiveOrdersBtn.style.display = 'inline-block';
    });
    backToActiveOrdersBtn.addEventListener('click', () => {
        activeOrdersTableSection.style.display = 'block';
        orderHistoryTableSection.style.display = 'none';
        showOrderHistoryBtn.style.display = 'inline-block';
        backToActiveOrdersBtn.style.display = 'none';
    });
}

// Orders section tab logic
const activeOrdersTab = document.getElementById('activeOrdersTab');
const orderHistoryTab = document.getElementById('orderHistoryTab');
if (activeOrdersTab && orderHistoryTab && activeOrdersTableSection && orderHistoryTableSection) {
    activeOrdersTab.addEventListener('click', () => {
        activeOrdersTab.classList.add('btn-secondary-active');
        orderHistoryTab.classList.remove('btn-secondary-active');
        activeOrdersTableSection.style.display = 'block';
        orderHistoryTableSection.style.display = 'none';
    });
    orderHistoryTab.addEventListener('click', () => {
        orderHistoryTab.classList.add('btn-secondary-active');
        activeOrdersTab.classList.remove('btn-secondary-active');
        activeOrdersTableSection.style.display = 'none';
        orderHistoryTableSection.style.display = 'block';
    });
}

// Real-time unread notification count badge
function updateNotificationBadgeRealtime() {
    if (!currentWorkerId) return;
    const badge = document.getElementById('notificationBadge');
    database.ref(`notifications/${currentWorkerId}`).on('value', (snapshot) => {
        let unreadCount = 0;
        snapshot.forEach((notifSnapshot) => {
            const notification = notifSnapshot.val();
            if (!notification.read) unreadCount++;
        });
        if (badge) {
            if (unreadCount > 0) {
                badge.textContent = unreadCount;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        }
    });
}

// Auth state
function showLoginSectionOnly() {
    const authContainer = document.getElementById('authContainer');
    const mainContainer = document.querySelector('.container');
    const notificationsSection = document.getElementById('notificationsSection');
    const mainNav = document.getElementById('mainNav');
    const modals = document.querySelectorAll('.modal');
    if (authContainer) authContainer.style.display = 'block';
    if (mainContainer) mainContainer.style.display = 'none';
    if (mainNav) mainNav.style.display = 'none';
    if (notificationsSection) notificationsSection.style.display = 'none';
    modals.forEach(m => m.style.display = 'none');
}

// Preloader Status Updates
function updateLoadingStatus(status) {
    const loadingStatus = document.getElementById('loadingStatus');
    if (loadingStatus) {
        loadingStatus.textContent = status;
    }
}

function showLoader() { 
    if (loaderOverlay) {
        loaderOverlay.style.display = 'flex';
        updateLoadingStatus('Initializing...');
    }
}

function hideLoader() { 
    if (loaderOverlay) {
        updateLoadingStatus('Welcome! Munafa Markaz Ready');
        setTimeout(() => {
            loaderOverlay.style.display = 'none';
        }, 1000);
    }
}

// Enhanced Loading with Status Updates
async function loadWorkerData() {
    updateLoadingStatus('Loading worker data...');
    await new Promise(resolve => setTimeout(resolve, 800));
    
    updateLoadingStatus('Fetching orders...');
    await new Promise(resolve => setTimeout(resolve, 600));
    
    updateLoadingStatus('Calculating statistics...');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    updateLoadingStatus('Setting up notifications...');
    await new Promise(resolve => setTimeout(resolve, 400));
    
    updateLoadingStatus('Finalizing Munafa Markaz...');
    await new Promise(resolve => setTimeout(resolve, 300));
}

// Fallback: hide loader after 5 seconds in any case
setTimeout(hideLoader, 5000);

auth.onAuthStateChanged(async function(user) {
    const authContainer = document.getElementById('authContainer');
    const mainContainer = document.querySelector('.container');
    const notificationsSection = document.getElementById('notificationsSection');
    const mainNav = document.getElementById('mainNav');
    
    // Show preloader initially
    showLoader();
    
    try {
        if (user) {
            updateLoadingStatus('Authenticating user...');
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Check if worker
            const workerRef = database.ref('workers/' + user.uid);
            updateLoadingStatus('Verifying worker account...');
            const workerSnapshot = await workerRef.once('value');
            console.log('[AUTH STATE] User:', user.uid, 'Worker exists:', workerSnapshot.exists());
            
            if (workerSnapshot.exists()) {
                currentWorkerId = user.uid;
                currentWorkerName = workerSnapshot.val().name;
                console.log('Set Current Worker:', { id: currentWorkerId, name: currentWorkerName });
                
                updateLoadingStatus('Loading Munafa Markaz...');
                await loadWorkerData();
                
                const workerNameEl = document.getElementById('workerName');
                if (workerNameEl) workerNameEl.textContent = currentWorkerName;
                if (authContainer) authContainer.style.display = 'none';
                if (mainContainer) mainContainer.style.display = 'block';
                if (mainNav) mainNav.style.display = 'block';
                if (notificationsSection) notificationsSection.style.display = 'none';
                
                // Attach listeners only after authentication
                updateLoadingStatus('Setting up real-time updates...');
                database.ref('orders').orderByChild('workerId').equalTo(currentWorkerId).on('value', (snapshot) => {
                    orders = snapshot.val() || {};
                    updateOrdersTable(orders);
                    updateStats(orders);
                });
                database.ref('withdrawalRequests').orderByChild('workerId').equalTo(currentWorkerId).on('value', () => {
                    updateStats(orders);
                });
                updateNotificationBadgeRealtime(); // Update badge on auth state change
                
                // Hide preloader after everything is loaded
                setTimeout(() => {
                    hideLoader();
                }, 1000);
                
            } else {
                updateLoadingStatus('Access denied. Redirecting to login...');
                setTimeout(() => {
                    showLoginSectionOnly();
                    auth.signOut();
                    hideLoader();
                }, 1500);
                console.log('[AUTH STATE] No worker entry for user, signed out.');
            }
        } else {
            updateLoadingStatus('No user session. Showing login...');
            setTimeout(() => {
                showLoginSectionOnly();
                hideLoader();
            }, 1000);
        }
    } catch (error) {
        console.error('Auth state change error:', error);
        updateLoadingStatus('Error occurred. Please try again...');
        setTimeout(() => {
            showLoginSectionOnly();
            hideLoader();
        }, 2000);
    }
});

// Place logout handler after auth is defined
document.addEventListener('DOMContentLoaded', function() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            auth.signOut().then(() => {
                window.location.href = '../login.html';
            });
        });
    }
});