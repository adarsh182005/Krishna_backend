import Product from '../models/productModel.js';
import products from '../data/products.js';

// @desc    Fetch all products
// @route   GET /api/products
// @access  Public
const getProducts = async (req, res) => {
  const products = await Product.find({});
  res.json(products);
};

// @desc    Fetch single product by ID
// @route   GET /api/products/:id
// @access  Public
const getProductById = async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (product) {
    res.json(product);
  } else {
    res.status(404).json({ message: 'Product not found' });
  }
};

// @desc    Import sample products
// @route   POST /api/products/import
// @access  Private/Admin (for temporary use)
const importData = async (req, res) => {
  await Product.deleteMany(); // Deletes all existing products
  const importedProducts = await Product.insertMany(products); // Imports the sample data

  res.status(201).json({ message: 'Data Imported', importedProducts });
};

// @desc    Create a new product
// @route   POST /api/products
// @access  Private/Admin
const createProduct = async (req, res) => {
  const { name, image, description, category, price, countInStock } = req.body;

  const product = new Product({
    name: name,
    image: image,
    description: description,
    category: category,
    price: price,
    countInStock: countInStock,
  });

  try {
    const createdProduct = await product.save();
    res.status(201).json(createdProduct);
  } catch (error) {
    res.status(400).json({ message: 'Failed to create product', error: error.message });
  }
};

// @desc    Update a product
// @route   PUT /api/products/:id
// @access  Private/Admin
const updateProduct = async (req, res) => {
  const { name, image, description, category, price, countInStock } = req.body;
  const product = await Product.findById(req.params.id);

  if (product) {
    product.name = name || product.name;
    product.image = image || product.image;
    product.description = description || product.description;
    product.category = category || product.category;
    product.price = price || product.price;
    product.countInStock = countInStock || product.countInStock;

    try {
      const updatedProduct = await product.save();
      res.json(updatedProduct);
    } catch (error) {
      res.status(400).json({ message: 'Failed to update product', error: error.message });
    }
  } else {
    res.status(404).json({ message: 'Product not found' });
  }
};

// @desc    Delete a product
// @route   DELETE /api/products/:id
// @access  Private/Admin
const deleteProduct = async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (product) {
    await product.deleteOne();
    res.json({ message: 'Product removed' });
  } else {
    res.status(404).json({ message: 'Product not found' });
  }
};

// Make sure to export all functions at the end of the file
export { getProducts, getProductById, importData, createProduct, updateProduct, deleteProduct };