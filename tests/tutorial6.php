<?php
session_start();

$_SESSION['inventory'] = $_SESSION['inventory'] ?? [];

$_SESSION['inventory'][] = [
    'item' => $_POST['item'] ?? '',
    'quantity' => (int)($_POST['quantity'] ?? 0),
    'date' => $_POST['date'] ?? ''
];

// Sort descending by quantity
usort($_SESSION['inventory'], fn($a, $b) => $b['quantity'] <=> $a['quantity']);
?>
<!DOCTYPE html>
<html>
<head>
    <title>Farm Inventory Management System</title>
    <style>
        body { font-family: Arial; margin: 20px; }
        table { border-collapse: collapse; width: 60%; margin-top: 20px; }
        th, td { border: 1px solid #333; padding: 6px; text-align: center; }
        th { background: #eee; }
    </style>
</head>
<body>
    <h2>Farm Inventory Management System</h2>

    <!-- Single record form -->
    <form method="post">
        Item: <input type="text" name="item" required>
        Qty: <input type="number" name="quantity" required>
        Date: <input type="date" name="date" required>
        <input type="submit" value="Add Record">
    </form>

    <!-- Display table using array_map instead of loops -->
    <?= count($_SESSION['inventory']) 
        ? '<h3>Sorted Inventory Records</h3><table><tr><th>Item</th><th>Quantity</th><th>Date</th></tr>' 
        . implode('', array_map(fn($r) =>'<tr><td>'.htmlspecialchars($r['item']).'</td><td>'.$r['quantity'].'</td><td>'.$r['date'].'</td></tr>',
            $_SESSION['inventory']
        )) 
        . '</table>' 
        : '' ?>
</body>
</html>