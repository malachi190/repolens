<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Order extends Model
{
    protected $fillable = ['customer_id'];

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }
}

