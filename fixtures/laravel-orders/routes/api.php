<?php

use App\Http\Controllers\OrderController as OrdersController;
use Illuminate\Support\Facades\Route;

Route::post('/orders', [OrdersController::class, 'store']);
