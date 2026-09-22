<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreOrderRequest;
use App\Models\Order as PurchaseOrder;

class OrderController extends Controller
{
    public function store(StoreOrderRequest $request)
    {
        $order = PurchaseOrder::create($request->validated());

        return response()->json($order, 201);
    }
}
