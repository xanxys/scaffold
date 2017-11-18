// https://github.com/pastahito/electron-vue-webpack
module.exports = {

    watch: true,

    target: 'electron',

    entry: './main.js',

    output: {
        path: __dirname + '/app/build',
        publicPath: 'build/',
        filename: 'bundle.js'
    },

    module: {
        loaders: [{
            test: /\.vue$/,
            loader: 'vue-loader'
        }, {
            test: /\.(png|jpg|gif|svg)$/,
            loader: 'file-loader',
            query: {
                name: '[name].[ext]?[hash]'
            }
        }, {
            test: /\.js$/,
            exclude: /node_modules/,
            loader: "babel-loader",
            query: {
                presets: ['es2015']
            }
        },
        {
            test: /\.ts$/,
            loader: "ts-loader",
        },
        ]
    },

    resolve: {
        alias: {
            vue: 'vue/dist/vue.js'
        }
    }

}
